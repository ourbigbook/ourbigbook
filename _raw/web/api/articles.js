const router = require('express').Router()
const Op = require('sequelize').Op

const ourbigbook = require('ourbigbook')
const { htmlEscapeAttr, htmlEscapeContent } = ourbigbook
const webApi = require('ourbigbook/web_api')
const { sequelizeIterateOverPagination } = require('ourbigbook/nodejs_webpack_safe')

const auth = require('../auth')
const { cant } = require('../front/cant')
const front = require('../front/js')
const convert = require('../convert')
const lib = require('./lib')
const { MILLIS_PER_MONTH, oneMonthAgo } = lib
const config = require('../front/config')
const { maxArticleAnnouncesPerMonth } = config
const { host, user } = require('../front/routes')

const ANNOUNCE_YOU_ARE_RECEIVING_MESSAGE = 'You are receiving this email because a user you follow has announced their article.'

// Get multiple articles at once. If ?id= is specified once however, the returned
// list will necessarily contain at most one item as id is unique (or zero, not an error
// if the id does not exist), so this function can also
// be used to get just one article. Express.js also allows parameters to be specified
// multiple times, which generate arrays, so if ?id= is given multiple times, it
// specifies a precise list of multiple articles to fetch.
router.get('/', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Article, User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    // TODO Make it optional because it is generally very broken now.
    // There could however be performance advantages to this as well.
    // https://docs.ourbigbook.com/todo/fix-parentid-and-previoussiblingid-on-articles-api
    const includeParentAndPreviousSibling = lib.validateParam(req.query, 'include-parent', {
      typecast: front.typecastBoolean,
      defaultValue: false,
    })
    const slug = req.query.id
    const [
      {
        count: articlesCount,
        rows: articles
      },
      loggedInUser,
    ] = await Promise.all([
      Article.getArticles({
        sequelize,
        limit,
        offset,
        author: req.query.author,
        followedBy: req.query.followedBy,
        includeParentAndPreviousSibling,
        likedBy: req.query.likedBy,
        order: lib.getOrder(req, {
          allowedSortsExtra: Article.ALLOWED_SORTS_EXTRA,
        }),
        slug,
        topicId: req.query.topicId,
        topicIdSearch: req.query.search,
      }),
      req.payload ? User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      articles: await Promise.all(articles.map(function(article) {
        return article.toJson(loggedInUser)
      })),
      articlesCount,
    })
  } catch(error) {
    next(error);
  }
})

router.get('/redirects', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Article } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    let slugs = lib.validateParam(req.query, 'id', {
      validators: [front.isTypeOrArrayOf(front.isString)],
    })
    if (typeof slugs === 'string') {
      slugs = [slugs]
    }
    const redirects = await Article.findRedirects(slugs, { limit, offset })
    return res.json({
      redirects,
    })
  } catch(error) {
    next(error);
  }
})

// TODO do proper GraphQL one day and get rid of this.
// TODO also return parentId and previousSiblingId here:
// https://docs.ourbigbook.com/don-t-skip-parent-previous-sibling-updates-on-web-uploads
router.get('/hash', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const [limit, offset] = lib.getLimitAndOffset(req, res, {
      limitMax: webApi.ARTICLE_HASH_LIMIT_MAX,
    })
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
      required: true,
      attributes: [],
    }
    const author = req.query.author
    if (author) {
      authorInclude.where = { username: author }
    }
    const { count: filesCount, rows: files} = await sequelize.models.File.findAndCountAll({
      subQuery: false,
      include: [
        authorInclude,
        {
          model: sequelize.models.Render,
          where: {
            type: sequelize.models.Render.Types[ourbigbook.OUTPUT_FORMAT_HTML],
          },
          required: false,
          attributes: [],
        },
        {
          model: sequelize.models.Article,
          as: 'articles',
          attributes: ['list'],
        },
      ],
      attributes: [
        'path',
        'hash',
        [
          sequelize.fn('length', sequelize.col('bodySource')),
          'bodySourceLen',
        ],
        [
          // NULL: never converted
          sequelize.literal('"Render"."outdated" IS NULL OR "Render"."outdated"'),
          // TODO do it like this instead. Patience ran out. Second line ignored in generated query.
          //sequelize.where(
          //  sequelize.col('Render.date'), 'IS NULL', Op.OR,
          //  sequelize.col('Render.outdated')
          //),
          'renderOutdated'
        ],
      ],
      limit,
      offset,
      order: [['path', 'ASC']],
    })
    const articlesJson = []
    for (const file of files) {
      articlesJson.push({
        cleanupIfDeleted: (
          file.get('bodySourceLen') !== 0 ||
          (
            // Happens on render === false
            file.articles.length !== 0 &&
            file.articles[0].list
          )
        ),
        hash: file.hash,
        path: file.path,
        renderOutdated: !!file.get('renderOutdated'),
      })
    }
    return res.json({ articles: articlesJson, articlesCount: filesCount })
  } catch(error) {
    next(error);
  }
})

router.get('/feed', auth.required, async function(req, res, next) {
  try {
    let limit = 20
    let offset = 0
    if (typeof req.query.limit !== 'undefined') {
      limit = Number(req.query.limit)
    }
    if (typeof req.query.offset !== 'undefined') {
      offset = Number(req.query.offset)
    }
    const loggedInUser = await req.app.get('sequelize').models.User.findByPk(req.payload.id);
    const order = lib.getOrder(req)
    const {count: articlesCount, rows: articles} = await loggedInUser.findAndCountArticlesByFollowed(offset, limit, order)
    const articlesJson = await Promise.all(articles.map((article) => {
      return article.toJson(loggedInUser)
    }))
    return res.json({
      articles: articlesJson,
      articlesCount: articlesCount,
    })
  } catch(error) {
    next(error);
  }
})

// Create File and corresponding Articles. The File must not already exist.
router.post('/', auth.required, async function(req, res, next) {
  try {
    return await createOrUpdateArticle(req, res, { forceNew: true })
  } catch(error) {
    next(error);
  }
})

// Create or Update File and corresponding Articles. The File must not already exist.
router.put('/', auth.required, async function(req, res, next) {
  try {
    return await createOrUpdateArticle(req, res, { forceNew: false })
  } catch(error) {
    next(error);
  }
})

router.post('/announce', auth.required, async function(req, res, next) {
  try {
    // Check that article can be announced.
    const sequelize = req.app.get('sequelize')
    const { Article, User } = sequelize.models
    const [[article, lastAnnouncedArticlesInMonth], loggedInUser] = await Promise.all([
      lib.getArticle(req, res).then(async (article) => {
        return [
          article,
          await Article.getArticles({
            count: false,
            limit: maxArticleAnnouncesPerMonth,
            order: 'announcedAt',
            sequelize,
            where: {
              announcedAt: { [Op.gt]: oneMonthAgo() },
              authorId: article.authorId,
            },
          })
        ]
      }),
      User.findByPk(req.payload.id),
    ])
    if (article.announcedAt) {
      throw new lib.ValidationError(`the article ${article.slug} has already been announced`)
    }
    const author = article.file.author
    const msg = cant.announceArticle(loggedInUser, author.username)
    if (msg) {
      throw new lib.ValidationError([msg], 403)
    }
    let nextAnnounceAllowedAt = loggedInUser.nextAnnounceAllowedAt
    if (nextAnnounceAllowedAt) {
      if (new Date() < new Date(nextAnnounceAllowedAt)) {
        throw new lib.ValidationError(
          `Maximum number of article publishes reached for the last month (${maxArticleAnnouncesPerMonth}), ` +
          `you can publish again on ${nextAnnounceAllowedAt}`
        )
      }
    }
    const body = lib.validateParam(req, 'body')
    const message = lib.validateParam(body, 'message', {
      validators: [
        front.isString,
        front.isLengthSmallerOrEqualTo(config.maxArticleAnnounceMessageLength),
      ],
      defaultValue: undefined,
    })

    // Database modification side-effects.
    article.announcedAt = new Date()
    const savePromises = [
      article.save(),
    ]
    const nLastAnnouncedArticlesInMonth = lastAnnouncedArticlesInMonth.length
    if (nLastAnnouncedArticlesInMonth >= maxArticleAnnouncesPerMonth - 1) {
      loggedInUser.nextAnnounceAllowedAt = new Date(
        new Date(lastAnnouncedArticlesInMonth[nLastAnnouncedArticlesInMonth - 1].announcedAt).getTime() +
        MILLIS_PER_MONTH
      )
      savePromises.push(loggedInUser.save())
    }
    await Promise.all(savePromises)

    // Send the emails.
    const articleLink = `${host(req)}/${article.slug}`
    const messageTxt = `Check out my article: `
    const titleSource = article.file.titleSource
    let text = `${messageTxt}"${titleSource}" ${articleLink}\n`
    let html = `<p>${htmlEscapeContent(messageTxt)}` +
      `<a href="${htmlEscapeAttr(articleLink)}">${htmlEscapeContent(titleSource)}</a>` +
      `</p>\n`
    if (message) {
      text += `\n${message}\n`
      html += message.split('\n\n').map(l => `<p>${htmlEscapeContent(l)}</p>\n`).join('')
    }
    text += `\n${ANNOUNCE_YOU_ARE_RECEIVING_MESSAGE}\n`
    html += `<p>${htmlEscapeContent(ANNOUNCE_YOU_ARE_RECEIVING_MESSAGE)}</p>\n`
    const sendEmailsPromises = []
    for await (const follower of sequelizeIterateOverPagination(
      User.getUsers,
      {
        count: false,
        following: author.username,
        sequelize,
      },
      config.maxUsersInMemory,
    )) {
      if (follower.emailNotificationsForArticleAnnouncement) {
        sendEmailsPromises.push(lib.sendEmailToUser({
          fromName: author.displayName,
          html,
          req,
          subject: `Announcement: ${titleSource}`,
          text,
          to: follower,
        }))
      }
    }
    await Promise.all(sendEmailsPromises)

    return res.json({ article: await article.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

async function createOrUpdateArticle(req, res, opts) {
  const forceNew = opts.forceNew
  const sequelize = req.app.get('sequelize')
  const { Article, File, User } = sequelize.models
  const loggedInUser = await User.findByPk(req.payload.id);

  // API params.
  const body = lib.validateParam(req, 'body')
  const articleData = lib.validateParam(body, 'article')
  let bodySource = lib.validateParam(articleData, 'bodySource', {
    validators: [front.isString],
    defaultValue: undefined,
  })
  if (bodySource !== undefined) {
    lib.validateBodySize(loggedInUser, bodySource)
  }
  let titleSource = lib.validateParam(articleData, 'titleSource', {
    validators: [front.isString],
    defaultValue: undefined,
  })
  const path = lib.validateParam(body, 'path', { validators: [
    front.isString, front.isTruthy ], defaultValue: undefined })
  const owner = lib.validateParam(body, 'owner', { validators: [
    front.isString ], defaultValue: undefined })
  const render = lib.validateParam(body, 'render', {
    validators: [front.isBoolean], defaultValue: true})
  let list = lib.validateParam(body, 'list', {
    validators: [front.isBoolean], defaultValue: undefined})
  const updateNestedSetIndex = lib.validateParam(body, 'updateNestedSetIndex', {
    validators: [front.isBoolean], defaultValue: true})
  const parentId = lib.validateParam(body,
    // ID of article that will be the parent of this article, including the @username/ part.
    // However, at least to start with, @username/ will have to match your own username to
    // simplify things a bit.
    'parentId',
    // If undefined:
    // - if previousSiblingId is given, deduce parentId from it
    // - else if article already exists (i.e. this is an update), keep existing parent
    // - else (article does not already exist and previousSiblingId not given): throw an error
    {
      validators: [front.isString],
      defaultValue: undefined
    }
  )
  if (!render && titleSource === undefined) {
    // When rendering we can just take from DB from the previous ID extraction step.
    throw new lib.ValidationError(`titleSource param is mandatory when not rendering`)
  }

  let author
  if (owner === undefined) {
    author = loggedInUser
  } else {
    const msg = cant.editArticle(loggedInUser, owner)
    if (msg) {
      throw new lib.ValidationError([msg], 403)
    }
    author = await User.findOne({ where: { username: owner } })
    if (!author) {
      throw new lib.ValidationError(`owner: there is no user with username owner="${owner}"`)
    }
  }
  let articles = []
  let sourceNewerThanRender = true
  if (path !== undefined) {
    const file = await File.findOne({
      where: {
        path: `${ourbigbook.AT_MENTION_CHAR}${author.username}${ourbigbook.Macro.HEADER_SCOPE_SEPARATOR}${path}.${ourbigbook.OURBIGBOOK_EXT}`
      },
      include: {
        model: Article,
        as: 'articles',
      }
    })
    if (file) {
      if (render) {
        if (bodySource === undefined) {
          bodySource = file.bodySource
        }
        if (titleSource === undefined) {
          titleSource = file.titleSource
        }
        if (list === undefined) {
          list = file.articles[0].list
        }
      }
    }
  }

  // Check that we got titleSource and bodySource from either input parameters, or from an existing path on database.
  let missingName
  if (titleSource === undefined) {
    missingName = 'titleSource'
  }
  if (bodySource === undefined) {
    missingName = 'bodySource'
  }
  if (missingName) {
    throw new lib.ValidationError(`param "${missingName}" is mandatory when not rendering or when "path" to an existing article is not given. path="${path}"`)
  }

  // Render.
  let nestedSetNeedsUpdate
  if (
    render ||
    sourceNewerThanRender
  ) {
    const idPrefix = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    if (!(
      parentId === undefined ||
      parentId === idPrefix ||
      parentId.startsWith(`${idPrefix}/`)
    )) {
      throw new lib.ValidationError(`parentId="${parentId}" cannot belong to another user: "${parentId}"`)
    }
    const previousSiblingId = lib.validateParam(body,
      'previousSiblingId',
      // If undefined, make it the first child. This happens even on update:
      // the previous value is not kept, since undefined is the only way to indicate parent.
      { defaultValue: undefined }
    )
    const ret = await convert.convertArticle({
      author,
      bodySource,
      forceNew,
      list,
      sequelize,
      // TODO https://docs.ourbigbook.com/todo/remove-the-path-parameter-from-the-article-creation-api
      path,
      parentId,
      previousSiblingId,
      perf: config.log.perf,
      render,
      titleSource,
      updateNestedSetIndex,
    })
    articles = ret.articles
    nestedSetNeedsUpdate = ret.nestedSetNeedsUpdate
  }
  return res.json({
    articles: await Promise.all(articles.map(article => article.toJson(loggedInUser))),
    nestedSetNeedsUpdate,
    // bool: is the source newer than the render output? Could happen if we
    // just extracted IDs but didn't render later on for some reason, e.g.
    // ourbigbook --web crashed half way through ID extraction. false means
    // either not, or there was no
    sourceNewerThanRender,
  })
}

//// delete article
//// TODO https://docs.ourbigbook.com/todo/delete-articles
//router.delete('/', auth.required, async function(req, res, next) {
//  try {
//    const sequelize = req.app.get('sequelize')
//    const [article, user] = await Promise.all([
//      lib.getArticle(req, res),
//      sequelize.models.User.findByPk(req.payload.id),
//    ])
//    const msg = cant.deleteArticle(user, article)
//    if (msg) {
//      throw new lib.ValidationError([msg], 403)
//    }
//    if (article.isToplevelIndex()) {
//      throw new lib.ValidationError('Cannot delete the toplevel index')
//    }
//    await article.destroySideEffects()
//  } catch(error) {
//    next(error);
//  }
//})

// Likes.

/**
 * @param {boolean} create - trus if we are creating, false if destroying
 */
async function validateLike(req, res, user, article, isLike) {
  if (!article) {
    throw new lib.ValidationError(
      ['Article not found'],
      404,
    )
  }
  let msg
  if (isLike) {
    msg = cant.likeArticle(user, article)
  } else {
    msg = cant.unlikeArticle(user, article)
  }
  if (msg) {
    throw new lib.ValidationError([msg], 403)
  }
  if ((await user.hasLikedArticle(article)) === isLike) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${isLike ? 'already likes' : 'does not like'} article '${article.slug}'`],
      403,
    )
  }
}

/**
 * @param {boolean} create - trus if we are creating, false if destroying
 */
async function validateFollow(req, res, user, article, create) {
  if (!article) {
    throw new lib.ValidationError(
      ['Article not found'],
      404,
    )
  }
  let msg
  if (create) {
    msg = cant.followArticle(user, article)
  } else {
    msg = cant.unfollowArticle(user, article)
  }
  if (msg) {
    throw new lib.ValidationError([msg], 403)
  }
  if ((await user.hasFollowedArticle(article)) === create) {
    throw new lib.ValidationError(
      [`User '${user.username}' ${create ? 'already follow' : 'does not follow'} article '${article.slug}'`],
      403,
    )
  }
}

// Like an article
router.post('/like', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    await lib.likeObject({
      getObject: lib.getArticle,
      joinModel: sequelize.models.UserLikeArticle,
      objectName: 'article',
      req,
      res,
      validateLike,
    })
  } catch(error) {
    next(error);
  }
})

// Unlike an article
router.delete('/like', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateLike(req, res, loggedInUser, article, false)
    await loggedInUser.removeArticleLikeSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Follow an article
router.post('/follow', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateFollow(req, res, loggedInUser, article, true)
    await loggedInUser.addArticleFollowSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

// Unfollow an article
router.delete('/follow', auth.required, async function(req, res, next) {
  try {
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.app.get('sequelize').models.User.findByPk(req.payload.id),
    ])
    await validateFollow(req, res, loggedInUser, article, false)
    await loggedInUser.removeArticleFollowSideEffects(article)
    const newArticle = await lib.getArticle(req, res)
    return res.json({ article: await newArticle.toJson(loggedInUser) })
  } catch(error) {
    next(error);
  }
})

router.put('/update-nested-set/:user', auth.required, async function(req, res, next) {
  try {
    const username = req.params.user
    const sequelize = req.app.get('sequelize')
    await sequelize.transaction(async (transaction) => {
      const loggedInUser = await sequelize.models.User.findByPk(req.payload.id, { transaction })
      const msg = cant.updateNestedSet(loggedInUser, username)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
      await Promise.all([
        sequelize.models.Article.updateNestedSets(username, { transaction }),
        sequelize.models.User.update({ nestedSetNeedsUpdate: false }, { where: { username }, transaction }),
      ])
    })
    return res.json({})
  } catch(error) {
    next(error);
  }
})

module.exports = router
