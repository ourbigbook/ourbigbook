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
const { ValidationError, validateParam } = lib
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
    const { Article, Ref, User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res)
    // TODO Make it optional because it is generally very broken now.
    // There could however be performance advantages to this as well.
    // https://docs.ourbigbook.com/todo/fix-parentid-and-previoussiblingid-on-articles-api
    const includeParentAndPreviousSibling = lib.validateParam(req.query, 'include-parent', {
      typecast: front.typecastBoolean,
      defaultValue: false,
    })
    const slug = req.query.id
    const parentTypeString = req.query['parent-type']
    let parentType
    if (parentTypeString) {
      parentType = Ref.Types[parentTypeString]
      if (parentType === undefined) {
        throw new lib.ValidationError(`unknown parent-type argument: ${parentTypeString}`)
      }
    }
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
        parentId: req.query['parent'],
        parentType,
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

// Fetch one complete level of a lazily expanded table of contents.
router.get('/toc', auth.optional, async function(req, res, next) {
  try {
    const article = await lib.getArticle(req, res)
    return res.json({ articles: await article.getTocChildren() })
  } catch(error) {
    next(error)
  }
})

// Fetch another rendered batch from an article's descendant page.
router.get('/same-page', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res, {
      defaultLimit: config.maxArticlesFetch,
      limitMax: config.maxArticlesFetch,
    })
    const [article, loggedInUser] = await Promise.all([
      lib.getArticle(req, res),
      req.payload ? User.findByPk(req.payload.id) : null,
    ])
    return res.json({
      articles: await sequelize.models.Article.getArticlesInSamePage({
        article,
        getHasChild: true,
        getTagged: true,
        limit,
        list: true,
        loggedInUser,
        offset,
        sequelize,
        toplevelId: true,
      }),
    })
  } catch(error) {
    next(error)
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
    const { Article, File, Render, User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res, {
      limitMax: webApi.ARTICLE_HASH_LIMIT_MAX,
    })
    let where
    if (req.query.author) {
      const author = await User.findOne({
        attributes: ['id'],
        where: { username: req.query.author },
      })
      if (!author) return res.json({ articles: [], articlesCount: 0 })
      where = { authorId: author.id }
    }

    // Select and count narrow File rows first. Render and Article are needed
    // only to construct the response for the selected page.
    const [filesCount, page] = await Promise.all([
      File.count({ where }),
      File.findAll({
        attributes: ['id'],
        limit,
        offset,
        order: [['path', 'ASC']],
        raw: true,
        where,
      }),
    ])
    if (!page.length) return res.json({ articles: [], articlesCount: filesCount })
    const files = await File.findAll({
      include: [
        {
          model: Render,
          where: {
            type: Render.Types[ourbigbook.OUTPUT_FORMAT_HTML],
          },
          required: false,
          attributes: [],
        },
        {
          model: Article,
          as: 'articles',
          attributes: ['list'],
        },
      ],
      attributes: [
        'path',
        'hash',
        'checkedHash',
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
      order: [['path', 'ASC']],
      where: { id: { [Op.in]: page.map(file => file.id) } },
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
        checkedHash: file.checkedHash,
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

router.put('/bulk-update', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    res.json(
      await sequelize.transaction(async (transaction) => {
        const body = validateParam(req, 'body')
        const bodyWhere = validateParam(body, 'where')
        const username = validateParam(bodyWhere, 'username', {
          validators: [front.isString], defaultValue: undefined})
        const what = validateParam(body, 'what')
        const list = validateParam(what, 'list', {
          validators: [front.isBoolean], defaultValue: undefined})
        const { Article, User } = sequelize.models
        const [
          author,
          loggedInUser,
        ] = await Promise.all([
          username === undefined ? null : User.findOne({ where: { username }}),
          User.findByPk(req.payload.id, { transaction }),
        ])
        // Admin only for now due to blowup potential.
        const msg = cant.updateSiteSettings(loggedInUser)
        if (msg) {
          throw new ValidationError([msg], 403)
        }
        const where = {}
        if (username !== undefined) {
          if (author === null) {
            throw new ValidationError(`the user "${username}" does not exist`)
          }
          where.authorId = author.id
        }
        if (list !== undefined) {
          what.list = list
        }
        const ret = await Article.update(what, { where, transaction })
        return { count: ret[0] }
      })
    )
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
  const sequelize = req.app.get('sequelize')
  return res.json(await createOrUpdateArticleData(sequelize, req.payload.id, lib.validateParam(req, 'body'), opts))
}

async function createOrUpdateArticleData(sequelize, userId, body, opts) {
  return sequelize.transaction({ transaction: opts.transaction }, async (transaction) => {
    const forceNew = opts.forceNew
    const { Article, File, Site, User } = sequelize.models
    const [loggedInUser, site] = await Promise.all([
      User.findByPk(userId, { transaction }),
      Site.findOne({ transaction }),
    ])
    if (forceNew) {
      const msg = cant.createArticle(loggedInUser)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
    }

    // API params.
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
      author = await User.findOne({ where: { username: owner }, transaction })
      if (!author) {
        throw new lib.ValidationError(`owner: there is no user with username owner="${owner}"`)
      }
    }
    if (path !== undefined) {
      // Background renders must not read a source snapshot before waiting
      // for a concurrent upload/tree edit to finish.
      if (opts.expectedHash !== undefined) {
        await User.findByPk(author.id, { transaction, lock: transaction.LOCK.UPDATE })
      }
      const file = await File.findOne({
        where: {
          path: `${ourbigbook.AT_MENTION_CHAR}${author.username}${ourbigbook.Macro.HEADER_SCOPE_SEPARATOR}${path}.${ourbigbook.OURBIGBOOK_EXT}`
        },
        include: {
          model: Article,
          as: 'articles',
        },
        transaction,
      })
      if (file) {
        if (opts.expectedHash !== undefined && file.hash !== opts.expectedHash) {
          throw new lib.ValidationError(`Source changed since render was queued: ${path}`, 409)
        }
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
    let articles = []
    let nestedSetNeedsUpdate
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
      convertOptionsExtra: {
        automaticTopicLinksMaxWords: site.automaticTopicLinksMaxWords,
      },
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
      transaction,
      updateNestedSetIndex,
    })
    articles = ret.articles
    nestedSetNeedsUpdate = ret.nestedSetNeedsUpdate
    return {
      articles: opts.skipJson ? [] : await Promise.all(articles.map(article => article.toJson(loggedInUser))),
      nestedSetNeedsUpdate,
    }
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

function renderJobJson(job) {
  const first = JSON.parse(job.items)[0]
  return { id: job.id, phase: job.phase, status: job.status, completed: job.completed, total: job.total, error: job.error, firstArticle: first ? first.path : null, batchIndex: job.batchIndex, batchCount: job.batchCount }
}

router.put('/bulk', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { ArticleJob: Job, ArticleBuild: Build, File, User } = sequelize.models
    const user = await User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const requestId = req.body && req.body.requestId
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(requestId)) {
      throw new lib.ValidationError('requestId must be a unique 16–64 character alphanumeric/hyphen string')
    }
    const input = req.body.articles
    const phase = req.body.phase || 'render'
    if (!['extract', 'check', 'render'].includes(phase)) throw new lib.ValidationError('Invalid bulk phase')
    const start = req.body.start === undefined ? true : req.body.start
    if (typeof start !== 'boolean') throw new lib.ValidationError('start must be a boolean')
    const { batchIndex, batchCount } = req.body
    const { buildId, buildIndex } = req.body
    if (buildId !== undefined && (
      typeof buildId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(buildId) ||
      !Number.isInteger(buildIndex) || buildIndex < 0 || buildIndex >= 100000 || start
    )) throw new lib.ValidationError('Invalid build batch; build jobs must be staged')
    if ((batchIndex !== undefined || batchCount !== undefined) && (
      !Number.isInteger(batchIndex) || !Number.isInteger(batchCount) ||
      batchIndex < 0 || batchIndex >= batchCount || batchCount > 2147483647
    )) throw new lib.ValidationError('Invalid bulk batch position')
    if (!Array.isArray(input) || input.length < 1 || input.length > webApi.ARTICLE_RENDER_BATCH_LIMIT) {
      throw new lib.ValidationError(`articles must contain 1–${webApi.ARTICLE_RENDER_BATCH_LIMIT} render targets`)
    }
    const seen = new Set()
    const items = input.map(item => {
      if (!item || typeof item.path !== 'string' || !item.path || item.path.length > 4096 || seen.has(item.path)) {
        throw new lib.ValidationError('Each render target must have a distinct, nonempty path of at most 4096 characters')
      }
      seen.add(item.path)
      const target = { path: item.path, article: {}, render: phase !== 'extract' }
      if (phase === 'extract') {
        for (const key of ['titleSource', 'bodySource']) {
          if (!item.article || typeof item.article[key] !== 'string') throw new lib.ValidationError(`Missing ${key}`)
          lib.validateBodySize(user, item.article[key])
          target.article[key] = item.article[key]
        }
      }
      for (const key of ['parentId', 'previousSiblingId', 'hash']) {
        if (item[key] !== undefined) {
          if (typeof item[key] !== 'string' || item[key].length > 4096) throw new lib.ValidationError(`Invalid ${key}`)
          target[key] = item[key]
        }
      }
      for (const key of ['list', 'updateNestedSetIndex']) {
        if (item[key] !== undefined) {
          if (typeof item[key] !== 'boolean') throw new lib.ValidationError(`Invalid ${key}`)
          target[key] = item[key]
        }
      }
      return target
    })
    if (Buffer.byteLength(JSON.stringify(items)) > 8 * 1024 * 1024) throw new lib.ValidationError('Bulk batch exceeds 8 MiB')
    if (buildId !== undefined && phase !== 'extract' && items.some(item => !item.hash)) {
      throw new lib.ValidationError('Build check/render targets require a source hash')
    }
    const requestHash = webApi.hashToHex(JSON.stringify({ phase, items, batchIndex, batchCount, buildId, buildIndex }))
    await Job.expire()
    let job = await Job.findOne({ where: { userId: user.id, requestId } })
    if (!job) {
      // One bounded query, selecting metadata only. Sources are read individually
      // by the worker, after every source upload has finished.
      if (phase !== 'extract' && buildId === undefined) {
        const paths = items.map(item => `@${user.username}/${item.path}.bigb`)
        const files = await File.findAll({
          attributes: ['path', 'hash'], where: { authorId: user.id, path: paths }, raw: true,
        })
        const byPath = new Map(files.map(file => [file.path, file]))
        items.forEach((item, i) => {
          const file = byPath.get(paths[i])
          if (!file) throw new lib.ValidationError(`Uploaded source not found: ${item.path}`, 404)
          if (item.hash !== undefined && item.hash !== file.hash) throw new lib.ValidationError(`Source changed: ${item.path}`, 409)
          item.hash = file.hash
        })
      }
      const createJob = async transaction => {
        await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE })
        const existing = await Job.findOne({ where: { userId: user.id, requestId }, transaction })
        if (existing) return [existing, false]
        if (buildId !== undefined) {
          const build = await Build.findOne({ where: { id: buildId, userId: user.id }, transaction, lock: transaction.LOCK.UPDATE })
          if (!build) throw new lib.ValidationError('Build not found', 404)
          if (build.status !== 'staged') throw new lib.ValidationError('Build is already submitted', 409)
        } else if (await Build.findOne({ where: { userId: user.id, status: ['staged', 'running', 'cancelling'] }, transaction })) {
          throw new lib.ValidationError('Another bulk job is active for this user', 409)
        }
        // Bound staged storage even for clients sending one target per job.
        // Each phase gets at most the user's article quota (or existing count).
        const articleCount = await sequelize.models.Article.count({ where: { authorId: user.id }, transaction })
        const targetLimit = Math.max(user.maxArticles, articleCount, 1)
        const targetCount = Number(await Job.sum('total', { where: { userId: user.id, phase }, transaction }) || 0)
        if (targetCount + items.length > targetLimit) throw new lib.ValidationError('Build exceeds the per-phase article limit', 422)
        return Job.findOrCreate({
          where: { userId: user.id, requestId },
          defaults: { phase, requestHash, items: JSON.stringify(items), total: items.length, batchIndex, batchCount, buildId, buildIndex },
          transaction,
        })
      }
      ;[job] = await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, createJob)
    }
    if (job.requestHash !== requestHash) throw new lib.ValidationError('requestId was already used for a different render batch', 409)
    if (start) await Job.start(job)
    return res.status(202).json({ job: renderJobJson(await job.reload()) })
  } catch (error) {
    next(error)
  }
})

router.get('/bulk', auth.required, async function(req, res, next) {
  try {
    const { ArticleJob: Job, TreeRebuildJob, User } = req.app.get('sequelize').models
    const loggedInUser = await User.findByPk(req.payload.id)
    const username = req.query.author || loggedInUser.username
    if (typeof username !== 'string') throw new lib.ValidationError('Invalid author')
    const user = await User.findOne({ where: { username } })
    if (!user) throw new lib.ValidationError('User not found', 404)
    const denied = cant.viewUserSettings(loggedInUser, user)
    if (denied) throw new lib.ValidationError('Cannot view another user’s upload status', 403)
    if (req.query.view !== undefined) {
      if (!['todo', 'done'].includes(req.query.view)) throw new lib.ValidationError('Invalid job view')
      const [limit, offset] = lib.getLimitAndOffset(req, res, { limitMax: 100 })
      return res.json(await Job.history(user.id, { view: req.query.view, limit, offset }))
    }
    const activeBuild = await req.app.get('sequelize').models.ArticleBuild.findOne({ where: { activeUserId: user.id } })
    if (!activeBuild) {
      await Job.expire()
      await TreeRebuildJob.expire()
      await req.app.get('sequelize').models.BuildQueue.kick(user.id)
    }
    const attributes = ['id', 'batchIndex', 'batchCount', 'phase', 'status', 'completed', 'total', 'error', 'createdAt', 'finishedAt']
    const where = { userId: user.id }
    const [active, recent, stagedBatches, stagedArticles, trees] = await Promise.all([
      Job.findAll({ attributes, where: { ...where, status: { [Op.in]: ['queued', 'pending', 'running'] } }, order: [['id', 'DESC']], limit: 10 }),
      Job.findAll({ attributes, where, order: [['id', 'DESC']], limit: 20 }),
      Job.count({ where: { ...where, status: 'staged' } }),
      Job.sum('total', { where: { ...where, status: 'staged' } }),
      TreeRebuildJob.findAll({ attributes: ['id', 'status', 'error', 'createdAt'], where, order: [['id', 'DESC']], limit: 1 }),
    ])
    return res.json({ active, recent, stagedBatches, stagedArticles: Number(stagedArticles || 0), nestedSet: trees[0] || null, activeBuild })
  } catch (error) {
    next(error)
  }
})

// The authenticated user identifies the build. Tokens only fence stale clients.
router.get('/bulk/build', auth.required, async function(req, res, next) {
  try {
    const { ArticleBuild, ArticleJob, TreeRebuildJob } = req.app.get('sequelize').models
    const build = await ArticleBuild.current(req.payload.id)
    const job = build && build.status === 'running' ? await ArticleJob.findOne({
      attributes: ['id', 'phase'], where: { buildId: build.id, status: { [Op.ne]: 'completed' } }, order: [['buildIndex', 'ASC']],
    }) : null
    const active = await ArticleJob.findOne({ attributes: ['id', 'phase', 'status'],
      where: { userId: req.payload.id, status: ['pending', 'queued', 'running'] }, order: [['id', 'ASC']] })
    const tree = await TreeRebuildJob.findOne({ where: { activeUserId: req.payload.id } })
    res.json({ build: build && { token: build.id, status: build.status, error: build.error, jobCount: build.jobCount },
      job: job || active, tree: tree && { id: tree.id, status: tree.status } })
  } catch (error) { next(error) }
})

router.put('/bulk/build', auth.required, async function(req, res, next) {
  const { ArticleBuild: Build, User } = req.app.get('sequelize').models
  try {
    const user = await User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const { token, expected = null } = req.body || {}
    if (typeof token !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(token) ||
        (expected !== null && (typeof expected !== 'string' || expected.length > 64))) throw new lib.ValidationError('Invalid build token')
    const build = await Build.replace(user.id, token, expected)
    res.status(202).json({ build: { token: build.id, status: build.status } })
  } catch (error) {
    if (Build.lockBusy(error)) return res.status(202).json({ build: { status: 'cancelling' } })
    next(error)
  }
})

router.put('/bulk/build/commit', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const user = await sequelize.models.User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const { token, jobCount, rebuildTree } = req.body || {}
    if (typeof token !== 'string' || !Number.isInteger(jobCount) || jobCount < 0 || jobCount > 100000 || typeof rebuildTree !== 'boolean') {
      throw new lib.ValidationError('Invalid build submission')
    }
    await sequelize.models.ArticleBuild.commit(token, user.id, jobCount, rebuildTree)
    res.status(202).json({ build: { status: 'running' } })
    sequelize.models.BuildQueue.tick().catch(error => console.error('Could not dispatch build; queue timer will retry', error))
  } catch (error) { next(error) }
})

router.put('/bulk/builds', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { ArticleBuild: Build, User } = sequelize.models
    const user = await User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const { id } = req.body || {}
    if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) throw new lib.ValidationError('Invalid build ID')
    let build
    await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
      await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE })
      build = await Build.findOne({ where: { id, userId: user.id }, transaction })
      if (build) return
      await Build.assertIdle(user.id, transaction)
      if (await Build.findOne({ where: { userId: user.id }, transaction })) {
        throw new lib.ValidationError('Use an updated CLI to replace the current build', 409)
      }
      build = await Build.create({ id, userId: user.id }, { transaction })
    })
    res.status(202).json({ build })
  } catch (error) { next(error) }
})

router.put('/bulk/builds/:id', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const user = await sequelize.models.User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const { jobCount, rebuildTree } = req.body || {}
    if (!Number.isInteger(jobCount) || jobCount < 1 || jobCount > 100000 || typeof rebuildTree !== 'boolean') {
      throw new lib.ValidationError('Invalid build submission')
    }
    await sequelize.models.ArticleBuild.commit(req.params.id, user.id, jobCount, rebuildTree)
    // Persisted before dispatch: a crash here is recovered by the queue timer.
    await sequelize.models.BuildQueue.tick()
    res.status(202).json({ build: await sequelize.models.ArticleBuild.findByPk(req.params.id) })
  } catch (error) { next(error) }
})

router.get('/bulk/builds/:id', auth.required, async function(req, res, next) {
  try {
    const { ArticleBuild, ArticleJob } = req.app.get('sequelize').models
    const build = await ArticleBuild.findOne({ where: { id: req.params.id, userId: req.payload.id } })
    if (!build) throw new lib.ValidationError('Build not found', 404)
    const job = build.status === 'running' ? await ArticleJob.findOne({
      attributes: ['id', 'phase'], where: { buildId: build.id, status: { [Op.ne]: 'completed' } }, order: [['buildIndex', 'ASC']],
    }) : null
    res.json({ build, job })
  } catch (error) { next(error) }
})

router.put('/bulk/:id', auth.required, async function(req, res, next) {
  try {
    const { ArticleJob: Job, User } = req.app.get('sequelize').models
    const user = await User.findByPk(req.payload.id)
    const denied = cant.editArticle(user, user && user.username)
    if (denied) throw new lib.ValidationError([String(denied)], 403)
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) throw new lib.ValidationError('Invalid job ID')
    const job = await Job.findOne({ where: { id, userId: req.payload.id } })
    if (!job) throw new lib.ValidationError('Bulk job not found', 404)
    await Job.expire()
    await job.reload()
    return res.status(202).json({ job: renderJobJson(await Job.start(job)) })
  } catch (error) {
    next(error)
  }
})

router.get('/bulk/:id', auth.required, async function(req, res, next) {
  try {
    const Job = req.app.get('sequelize').models.ArticleJob
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) throw new lib.ValidationError('Invalid job ID')
    const job = await Job.findOne({
      where: { id, userId: req.payload.id },
    })
    if (!job) throw new lib.ValidationError('Render job not found', 404)
    // Durable builds are driven by workers and the startup timer. Polling is
    // read-only, avoiding SQLite writer contention with every rendered article.
    if (!job.buildId) {
      await Job.expire()
      await req.app.get('sequelize').models.BuildQueue.kick(req.payload.id)
      await job.reload()
    }
    return res.json({ job: renderJobJson(job) })
  } catch (error) {
    next(error)
  }
})

router.put('/update-nested-set/:user', auth.required, async function(req, res, next) {
  try {
    const username = req.params.user
    const sequelize = req.app.get('sequelize')
    const foreground = lib.validateParam(req.body || {}, 'foreground', {
      validators: [front.isBoolean], defaultValue: false,
    })
    if (!foreground && sequelize.models.TreeRebuildJob.useBackground()) {
      const loggedInUser = await sequelize.models.User.findByPk(req.payload.id)
      const msg = cant.updateNestedSet(loggedInUser, username)
      if (msg) throw new lib.ValidationError([msg], 403)
      const user = await sequelize.models.User.findOne({ where: { username } })
      if (!user) throw new lib.ValidationError(['User not found'], 404)
      const Job = sequelize.models.TreeRebuildJob
      const [job, created] = await Job.enqueue(user.id)
      if (created) {
        try {
          await Job.launch(job)
        } catch (error) {
          // A timed-out launch may still start a dyno. Only pending jobs can be
          // cancelled; a worker that already claimed it must finish normally.
          await Job.update({ status: 'failed', activeUserId: null, error: error.message, finishedAt: new Date() }, {
            where: { id: job.id, status: 'pending' },
          })
        }
      }
      return res.status(202).json({ job: { id: job.id } })
    }
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

router.get('/update-nested-set/:user/:job', auth.required, async function(req, res, next) {
  try {
    const { User, TreeRebuildJob: Job } = req.app.get('sequelize').models
    const loggedInUser = await User.findByPk(req.payload.id)
    const msg = cant.updateNestedSet(loggedInUser, req.params.user)
    if (msg) throw new lib.ValidationError([msg], 403)
    const id = Number(req.params.job)
    if (!Number.isSafeInteger(id) || id <= 0) throw new lib.ValidationError(['Invalid job ID'], 422)
    const user = await User.findOne({ where: { username: req.params.user } })
    const job = user && await Job.findOne({ where: { id, userId: user.id } })
    if (!job) throw new lib.ValidationError(['Job not found'], 404)
    await Job.expire()
    await req.app.get('sequelize').models.BuildQueue.kick(user.id)
    await job.reload()
    return res.json({ job: { id: job.id, status: job.status, error: job.error } })
  } catch (error) {
    next(error)
  }
})

module.exports = router
module.exports.createOrUpdateArticleData = createOrUpdateArticleData
