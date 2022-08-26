const assert = require('assert')
const path = require('path')

const { DataTypes, Op } = require('sequelize')

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

const config = require('../front/config')
const front_js = require('../front/js')
const convert = require('../convert')
const e = require('cors')
const { execPath } = require('process')

module.exports = (sequelize) => {
  // Each Article contains rendered HTML output, analogous to a .html output file in OurBigBook CLI.
  // The input source is stored in the File model. A single file can then generate
  // multiple Article if it has multiple headers.
  const Article = sequelize.define(
    'Article',
    {
      // E.g. `johnsmith/mathematics`.
      slug: {
        type: DataTypes.TEXT,
        unique: {
          message: 'The article ID must be unique.'
        },
        set(v) {
          this.setDataValue('slug', v.toLowerCase())
        },
        allowNull: false,
      },
      // E.g. for `johnsmith/mathematics` this is just the `mathematics`.
      // Can't be called just `id`, sequelize complains that it is not a primary key with that name.
      topicId: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered title. Only contains the inner contents of the toplevel h1's title.
      // not the HTML header itself. Used extensively e.g. in article indexes.
      titleRender: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // This was stored here as well as in addition to in File because we previously allowed
      // multiple articles per file, just like is done locally. This was later forbidden on Web.
      // With multiple articles per file, we may have multiple title sources. And then these can
      // get used elsewhere, notably they can appears in places where the rendered output cannot
      // be displayed, e.g. <title> tags.
      titleSource: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          len: {
            args: [1, config.maxArticleTitleSize],
            msg: `Titles can have at most ${config.maxArticleTitleSize} characters`
          },
        }
      },
      titleSourceLine: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Full rendered body article excluding toplevel h1 render.
      render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered toplevel h1.
      h1Render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered toplevel h1 as it would look like if it were an h2.
      h2Render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      depth: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      author: {
        type: DataTypes.VIRTUAL,
        get() {
          if (this.file) {
            return this.file.author
          } else {
            return null
          }
        },
        set(value) {
          throw new Error('cannot set virtual`author` value directly');
        }
      },
      // To fetch the tree recursively on the fly.
      // https://stackoverflow.com/questions/192220/what-is-the-most-efficient-elegant-way-to-parse-a-flat-table-into-a-tree/42781302#42781302
      nestedSetIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Points to the nestedSetIndex of the next sibling, or where the
      // address at which the next sibling would be if it existed.
      nestedSetNextSibling: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      followerCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      issueCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      // TODO updatedAt lazy to create migration now.
      indexes: [
        { fields: ['createdAt'], },
        { fields: ['issueCount'], },
        { fields: ['followerCount'], },
        { fields: ['topicId'], },
        { fields: ['slug'], },
        { fields: ['score'], },
        { fields: ['nestedSetIndex'], },
        // For parent searches.
        { fields: ['nestedSetIndex', 'nestedSetNextSibling'], },

        // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
        { fields: ['fileId'], },
      ],
    }
  )

  //// TODO https://docs.ourbigbook.com/todo/delete-articles
  //Article.prototype.destroySideEffects = function() {
  //  sequelize.transaction({ transaction }, async (transaction) => {
  //    // topic.articleCount--
  //    // author.score -= article.score
  //    // TODO delete IDs defined inside article
  //  })
  //}

  Article.prototype.getAuthor = async function() {
    return (await this.getFileCached()).author
  }

  Article.prototype.getFileCached = async function() {
    let file
    if (!this.file || this.file.author === undefined) {
      file = await this.getFile({ include: [ { model: sequelize.models.User, as: 'author' } ]})
    } else {
      file = this.file
    }
    return file
  }

  // Get a version of the source code of this article that would be
  // written to a local file if we were to export it.
  Article.prototype.getSourceExport = async function() {
    const file = await this.getFileCached()
    let ret = front_js.modifyEditorInput(file.titleSource, file.bodySource).new
    const children = await this.getChildren()
    let include_source = ''
    const isToplevelIndex = this.isToplevelIndex()
    for (const child of children) {
      let inc_orig = this.slug
      if (!isToplevelIndex) {
        inc_orig = inc_orig.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(0, -1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
      }
      include_source += `\\Include[${path.relative(inc_orig, child.slug)}]\n`
    }
    if (include_source) {
      ret += '\n' + include_source
    }
    return ret
  }

  Article.prototype.getChildren = async function() {
    return sequelize.models.Article.findAll({
      where: {
        nestedSetIndex: {
          [sequelize.Sequelize.Op.gt]: this.nestedSetIndex,
          [sequelize.Sequelize.Op.lt]: this.nestedSetNextSibling,
        },
        depth: this.depth + 1,
      },
      include: [{
        model: sequelize.models.File,
        as: 'file',
        required: true,
        include: [{
          model: sequelize.models.User,
          as: 'author',
          where: { username: this.file.author.username },
          required: true,
        }]
      }]
    })
  }

  Article.prototype.toJson = async function(loggedInUser) {
    const authorPromise = this.file && this.file.author ? this.file.author : this.getAuthor()
    // TODO do liked and followed with JOINs on caller, check if it is there and skip this if so.
    const [liked, followed, author] = await Promise.all([
      loggedInUser ? loggedInUser.hasLikedArticle(this.id) : false,
      loggedInUser ? loggedInUser.hasFollowedArticle(this.id) : false,
      (await authorPromise).toJson(loggedInUser),
    ])
    function addToDictWithoutUndefined(target, source, keys) {
      for (const prop of keys) {
        const val = source[prop]
        if (val !== undefined) {
          target[prop] = val
        }
      }
      return target
    }
    const file = {}
    addToDictWithoutUndefined(file, this.file, ['titleSource', 'bodySource', 'path', 'sha256'])
    const ret = {
      followed,
      liked,
      // Putting it here rather than in the more consistent file.author
      // to improve post serialization polymorphism with issues.
      author,
      file,
    }
    this.topicCount = this.get('topicCount')
    addToDictWithoutUndefined(ret, this, [
      'depth',
      'followerCount',
      'h1Render',
      'h2Render',
      'id',
      'issueCount',
      'slug',
      'sha256',
      'topicId',
      'titleRender',
      'titleSource',
      'titleSourceLine',
      'score',
      'render',
      'issueCount',
      'topicCount'
    ])
    if (this.createdAt) {
      ret.createdAt = this.createdAt.toISOString()
    }
    if (this.updatedAt) {
      ret.updatedAt = this.updatedAt.toISOString()
    }
    return ret
  }

  Article.prototype.rerender = async function(options = {}) {
    const file = await this.getFileCached()
    const transaction = options.transaction
    await sequelize.transaction({ transaction }, async (transaction) => {
      await convert.convertArticle({
        author: file.author,
        bodySource: file.bodySource,
        forceNew: false,
        path: ourbigbook.path_splitext(file.path.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR))[0],
        render: true,
        sequelize,
        titleSource: file.titleSource,
        transaction,
      })
    })
  }

  Article.prototype.isToplevelIndex = function() {
    return !this.slug.includes(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
  }

  /**
   * Return Articles ordered by username and nested sets.
   * @return {Article[]}
   */
  Article.findNestedSets = async function(opts={}) {
    const userWhere = {}
    const username = opts.username
    if (username) {
      userWhere.username = username
    }
    return sequelize.models.Article.findAll({
      include: [{
        model: sequelize.models.File,
        as: 'file',
        required: true,
        include: [{
          model: sequelize.models.User,
          as: 'author',
          where: userWhere,
          required: true,
        }],
      }],
      order: [
        [
          { model: sequelize.models.File, as: 'file' },
          { model: sequelize.models.User, as: 'author' },
          'username',
          'ASC'
        ],
        ['nestedSetIndex', 'ASC'],
      ],
      transaction: opts.transaction,
    })
  }

  Article.getArticle = async function({
    includeIssues,
    includeIssueNumber,
    includeIssuesOrder,
    includeParentAndPreviousSibling,
    limit,
    sequelize,
    slug,
  }) {
    const fileInclude = [
      {
        model: sequelize.models.User,
        as: 'author',
      },
      {
        model: sequelize.models.Render,
        where: {
          type: sequelize.models.Render.Types[ourbigbook.OUTPUT_FORMAT_HTML],
        },
        required: false,
      },
    ]
    if (includeParentAndPreviousSibling) {
      // Behold.
      // TODO reimplement with the nested index information instead of this megajoin.
      fileInclude.push({
        model: sequelize.models.Id,
        subQuery: false,
        include: [{
          model: sequelize.models.Ref,
          as: 'to',
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
          subQuery: false,
          include: [{
            // Parent ID.
            model: sequelize.models.Id,
            as: 'from',
            subQuery: false,
            include: [
              {
                model: sequelize.models.File,
              },
              {
                model: sequelize.models.Ref,
                as: 'from',
                subQuery: false,
                on: {
                  '$file->Id->to->from->from.from_id$': {[Op.eq]: sequelize.col('file->Id->to->from.idid')},
                  '$file->Id->to->from->from.to_id_index$': {[Op.eq]: sequelize.where(sequelize.col('file->Id->to.to_id_index'), '-', 1)},
                },
                include: [{
                  // Previous sibling ID.
                  model: sequelize.models.Id,
                  as: 'to',
                  include: [
                    {
                      model: sequelize.models.File,
                    },
                  ],
                }],
              }
            ],
          }],
        }],
      })
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: fileInclude,
    }]
    let order
    if (includeIssues) {
      const includeIssue = {
        model: sequelize.models.Issue,
        as: 'issues',
        required: false,
        include: [{ model: sequelize.models.User, as: 'author' }],
      }
      if (includeIssueNumber) {
        includeIssue.where = { number: includeIssueNumber }
      }
      include.push(includeIssue)
      order = [[
        'issues', includeIssuesOrder === undefined ? 'createdAt' : includeIssuesOrder, 'DESC'
      ]]
    }
    const article = await sequelize.models.Article.findOne({
      where: { slug },
      include,
      order,
      subQuery: false,
    })
    if (includeParentAndPreviousSibling && article !== null) {
      // Some access helpers, otherwise too convoluted!.
      const articleId = article.file.Id
      if (articleId) {
        const parentId = articleId.to[0].from
        article.parentId = parentId
        const previousSiblingRef = parentId.from[0]
        if (previousSiblingRef) {
          article.previousSiblingId = previousSiblingRef.to
        }
      }
    }
    return article
  }

  // Helper for common queries.
  Article.getArticles = async ({
    author,
    count,
    followedBy,
    likedBy,
    limit,
    offset,
    order,
    orderAscDesc,
    sequelize,
    slug,
    topicId,
    transaction,
  }) => {
    assert.notStrictEqual(sequelize, undefined)
    if (orderAscDesc === undefined) {
      orderAscDesc = 'DESC'
    }
    if (count === undefined) {
      count = true
    }

    let where = {}
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
      required: true,
    }
    if (author) {
      authorInclude.where = { username: author }
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: [authorInclude],
      required: true,
    }]
    if (followedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'followers',
        where: { username: followedBy },
      })
    }
    if (likedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'articleLikedBy',
        where: { username: likedBy },
      })
    }
    if (slug) {
      where.slug = slug
    }
    if (topicId) {
      where.topicId = topicId
    }
    const orderList = []
    if (order !== undefined) {
      orderList.push([order, orderAscDesc])
    }
    if (order !== 'createdAt') {
      // To make results deterministic.
      orderList.push(['createdAt', 'DESC'])
    }
    if (Object.keys(where).length === 0) {
      where = undefined;
    }
    const findArgs = {
      include,
      limit,
      offset,
      order: orderList,
      transaction,
      where,
    }
    let ret
    if (count) {
      ret = sequelize.models.Article.findAndCountAll(findArgs)
    } else {
      ret = sequelize.models.Article.findAll(findArgs)
    }
    return ret;
  }

  // Maybe try to merge into getArticle one day?
  Article.getArticlesInSamePage = async ({
    article,
    loggedInUser,
    // Get just the article itself. This is just as a way to get the number of
    // articles on same topic + discussion count which we already get the for the h2,
    // which are the main use case of this function.
    //
    // We don't want to pull both of them together because then we'd be pulling
    // both h1 and h2 renders which we don't need. Talk about premature optimization!
    h1,
    limit,
    render,
    sequelize,
  }) => {
    if (render === undefined) {
      render = true
    }
//    // OLD VERSION 1: as much as possible from calls, same article by file.
//    const articlesInSamePageAttrs = [
//      'id',
//      'score',
//      'slug',
//      'topicId',
//    ]
//    const include = [
//      {
//        model: sequelize.models.File,
//        as: 'file',
//        required: true,
//        attributes: ['id'],
//        include: [
//          {
//            model: sequelize.models.User,
//            as: 'author',
//          },
//          {
//            model: sequelize.models.Article,
//            as: 'file',
//            required: true,
//            attributes: ['id'],
//            where: { slug },
//          }
//        ]
//      },
//      {
//        model: sequelize.models.Issue,
//        as: 'issues',
//      },
//      {
//        model: sequelize.models.Article,
//        as: 'sameTopic',
//        attributes: [],
//        required: true,
//        include: [{
//          model: sequelize.models.Topic,
//          as: 'article',
//          required: true,
//        }]
//      },
//    ]
//    // This is the part I don't know how to do here. Analogous for current user liked check.
//    // It works, but breaks "do I have my version check".
//    // https://github.com/cirosantilli/cirosantilli.github.io/blob/1be5cb8ef7c03d03e54069c6a5329f54e044de9c/nodejs/sequelize/raw/many_to_many.js#L351
//    //if (loggedInUser) {
//    //  include.push({
//    //    model: sequelize.models.Article,
//    //    as: 'sameTopic2',
//    //    //attributes: [],
//    //    required: true,
//    //    include: [{
//    //      model: sequelize.models.File,
//    //      as: 'file',
//    //      //attributes: [],
//    //      required: true,
//    //      include: [{
//    //        model: sequelize.models.User,
//    //        as: 'author',
//    //        attributes: ['id'],
//    //        required: false,
//    //        where: { id: loggedInUser.id },
//    //      }]
//    //    }],
//    //  })
//    //}
//    return sequelize.models.Article.findAll({
//      attributes: articlesInSamePageAttrs.concat([
//        [sequelize.fn('COUNT', sequelize.col('issues.id')), 'issueCount'],
//        [sequelize.col('sameTopic.article.articleCount'), 'topicCount'],
//        // This works for "do I have my version check".
//        //[sequelize.fn('max', sequelize.col('sameTopic2.file.author.id')), 'hasSameTopic'],
//      ]),
//      group: articlesInSamePageAttrs.map(a => `Article.${a}`),
//      subQuery: false,
//      order: [['topicId', 'ASC']],
//      include,
//    })
//
//    // OLD VERSION 2: same article by file, one megaquery.
//    // For a minimal prototype of the difficult SameTopicByLoggedIn part:
//    // https://github.com/cirosantilli/cirosantilli.github.io/blob/1be5cb8ef7c03d03e54069c6a5329f54e044de9c/nodejs/sequelize/raw/many_to_many.js#L351
//    ;const [rows, meta] = await sequelize.query(`
//SELECT
//  "Article"."id" AS "id",
//  "Article"."score" AS "score",
//  "Article"."slug" AS "slug",
//  "Article"."topicId" AS "topicId",
//  "Article"."titleSource" AS "titleSource",
//  "File.Author"."id" AS "file.author.id",
//  "File.Author"."username" AS "file.author.username",
//  "SameTopic"."articleCount" AS "topicCount",
//  "ArticleSameTopicByLoggedIn"."id" AS "hasSameTopic",
//  "UserLikeArticle"."userId" AS "liked",
//  COUNT("issues"."id") AS "issueCount"
//FROM
//  "Article"
//  INNER JOIN "File" ON "Article"."fileId" = "File"."id"
//  LEFT OUTER JOIN "User" AS "File.Author" ON "File"."authorId" = "File.Author"."id"
//  INNER JOIN "Article" AS "ArticleSameFile"
//    ON "File"."id" = "ArticleSameFile"."fileId"
//    AND "ArticleSameFile"."slug" = :slug
//  INNER JOIN "Article" AS "ArticleSameTopic" ON "Article"."topicId" = "ArticleSameTopic"."topicId"
//  INNER JOIN "Topic" AS "SameTopic" ON "ArticleSameTopic"."id" = "SameTopic"."articleId"
//  LEFT OUTER JOIN (
//    SELECT "Article"."id", "Article"."topicId"
//    FROM "Article"
//    INNER JOIN "File"
//      ON "Article"."fileId" = "File"."id"
//      AND "File"."authorId" = :loggedInUserId
//  ) AS "ArticleSameTopicByLoggedIn"
//    ON "Article"."topicId" = "ArticleSameTopicByLoggedIn"."topicId"
//  LEFT OUTER JOIN "UserLikeArticle"
//    ON "UserLikeArticle"."articleId" = "Article"."id" AND
//       "UserLikeArticle"."userId" = :loggedInUserId
//  LEFT OUTER JOIN "Issue" AS "issues" ON "Article"."id" = "issues"."articleId"
//GROUP BY
//  "Article"."id",
//  "Article"."score",
//  "Article"."slug",
//  "Article"."topicId",
//  "Article"."titleSource",
//  "File.Author"."id",
//  "File.Author"."username",
//  "SameTopic"."articleCount",
//  "ArticleSameTopicByLoggedIn"."id",
//  "UserLikeArticle"."userId"
//ORDER BY "slug" ASC
//`,
//      {
//        replacements: {
//          loggedInUserId: loggedInUser ? loggedInUser.id : null,
//          slug,
//        }
//      }
//    )

    //const allFields = {
    //  'id'
    //  'score',
    //  'slug',
    //  'topicId',
    //  'titleSource',
    //  'render',
    //}

    ;const [rows, meta] = await sequelize.query(`
SELECT
  "Article"."id" AS "id",
  "Article"."score" AS "score",
  "Article"."slug" AS "slug",
  "Article"."topicId" AS "topicId",
  "Article"."issueCount" AS "issueCount",
  "Article"."titleSource" AS "titleSource",${render ? `\n  "Article"."render" AS "render",` : ''}
  ${h1 ? '"Article"."h1Render" AS "h1Render"' : '"Article"."h2Render" AS "h2Render"'},
  "Article"."topicId" AS "topicId",
  "Article"."titleRender" AS "titleRender",
  "Article"."depth" AS "depth",
  "File.Author"."id" AS "file.author.id",
  "File.Author"."username" AS "file.author.username",
  "SameTopic"."articleCount" AS "topicCount",
  "ArticleSameTopicByLoggedIn"."id" AS "hasSameTopic",
  "UserLikeArticle"."userId" AS "liked"
FROM
  "Article"
  INNER JOIN "File" ON "Article"."fileId" = "File"."id"${h1 ? '\n  INNER JOIN "Id" ON "File"."toplevel_id" = "Id"."idid"' : ''}
  INNER JOIN "User" AS "File.Author"
    ON "File"."authorId" = "File.Author"."id" AND
       "File.Author"."username" = :authorUsername
  INNER JOIN "Article" AS "ArticleSameTopic" ON "Article"."topicId" = "ArticleSameTopic"."topicId"
  INNER JOIN "Topic" AS "SameTopic" ON "ArticleSameTopic"."id" = "SameTopic"."articleId"
  LEFT OUTER JOIN (
    SELECT "Article"."id", "Article"."topicId"
    FROM "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
      AND "File"."authorId" = :loggedInUserId
  ) AS "ArticleSameTopicByLoggedIn"
    ON "Article"."topicId" = "ArticleSameTopicByLoggedIn"."topicId"
  LEFT OUTER JOIN "UserLikeArticle"
    ON "UserLikeArticle"."articleId" = "Article"."id" AND
       "UserLikeArticle"."userId" = :loggedInUserId
  LEFT OUTER JOIN "Issue" AS "issues" ON "Article"."id" = "issues"."articleId"
  ${h1
    ? `WHERE "Article"."nestedSetIndex" = :nestedSetIndex`
    : `WHERE "Article"."nestedSetIndex" > :nestedSetIndex AND
    "Article"."nestedSetIndex" < :nestedSetNextSibling`
  }
GROUP BY
  "Article"."id",
  "Article"."score",
  "Article"."slug",
  "Article"."topicId",
  "Article"."titleSource",
  "File.Author"."id",
  "File.Author"."username",
  "SameTopic"."articleCount",
  "ArticleSameTopicByLoggedIn"."id",
  "UserLikeArticle"."userId"
ORDER BY "Article"."nestedSetIndex" ASC${limit !== undefined ? `
LIMIT ${limit}` : ''}
`,
      {
        replacements: {
          authorUsername: article.author.username,
          loggedInUserId: loggedInUser ? loggedInUser.id : null,
          nestedSetIndex: article.nestedSetIndex,
          nestedSetNextSibling: article.nestedSetNextSibling,
        }
      }
    )

    //sequelize.query(`
    //FROM "Article"
    //WHERE "nestedSetIndex" > :nestedSetIndex AND "nestedSetIndex" < :nestedSetNextSibling
    //ORDER BY "nestedSetIndex" ASC
    //     {
    //       replacements: {
    //         nestedSetIndex: article.nestedSetIndex,
    //         nestedSetNextSibling: article.nestedSetNextSibling,
    //       }
    //     }
    //   ),
    //`)
    for (const row of rows) {
      row.hasSameTopic = row.hasSameTopic === null ? false : true
      row.liked = row.liked === null ? false : true
      row.author = {
        id: row['file.author.id'],
        username: row['file.author.username'],
      }
      delete row['file.author.id']
      delete row['file.author.username']
    }
    return rows
  }

  /**
   * Calculate nested sets from Ref information and return this data.
   * As of creating this function, this was supposed to be incrementally
   * done by the convertArticle() internal function. But we are considering
   * doing it in bulk to speed things up. And also creating this to quickfix
   * a wrong index observed in production for unknown reasons:
   * https://docs.ourbigbook.com/subsections-missing-on-web-dynamic-tree
   * 
   * @param {string} username
   */
  Article.getNestedSetsFromRefs = async function(username, opts={}) {
    const toplevelId = `${ourbigbook.AT_MENTION_CHAR}${username}`
    const idRows = await ourbigbook_nodejs_webpack_safe.fetch_header_tree_ids(
      sequelize,
      [toplevelId],
      { transaction: opts.transaction },
    )
    let idTreeNode = {
      id: toplevelId,
      children: [],
      nextSibling: undefined,
      parent: undefined,
      level: 0,
      nestedSetIndex: undefined,
      nestedSetNextSibling: undefined,
    }
    const idToIdTreeNode = {
      [toplevelId]: idTreeNode,
    }
    for (const row of idRows) {
      const level = row.level
      const parent = idToIdTreeNode[row.from_id]
      const childIdx = parent.children.length
      const idTreeNode = {
        id: row.idid,
        children: [],
        childIdx,
        level,
        parent,
        nestedSetIndex: undefined,
        nestedSetNextSibling: undefined,
      }
      if (childIdx > 0) {
        parent.children[childIdx - 1].nextSibling = idTreeNode
      }
      idToIdTreeNode[row.idid] = idTreeNode
      parent.children.push(idTreeNode)
    }
    const nestedSet = []

    // Calculated nestedSetIndex, a simple pre-order traversal.
    let i = 0
    let todo = [idTreeNode]
    while (todo.length) {
      const node = todo.pop()
      node.nestedSetIndex = i
      nestedSet.push(node)
      todo.push(...node.children.slice().reverse())
      i++
    }

    // Calculated nestedSetNextSibling.
    // Needs a second pass because it relies on the indices of nodes we
    // haven't visited yet on the first pass.
    todo = [idTreeNode]
    while (todo.length) {
      const node = todo.pop()
      if (node.nextSibling) {
        node.nestedSetNextSibling = node.nextSibling.nestedSetIndex
      } else if (node.children.length === 0) {
        const nextSibling = node.nestedSetIndex + 1
        node.nestedSetNextSibling = nextSibling
        let ancestor = node.parent
        while(
          ancestor !== undefined &&
          ancestor.nextSibling === undefined
        ) {
          ancestor.nestedSetNextSibling = nextSibling
          ancestor = ancestor.parent
        }
      }
      todo.push(...node.children.slice().reverse())
    }
    return nestedSet
  }

  Article.rerender = async (opts={}) => {
    if (opts.log === undefined) {
      opts.log = false
    }
    const articles = await sequelize.models.Article.findAll({
      include: [ { model: sequelize.models.File, as: 'file' } ],
    })
    for (const article of articles) {
      if (opts.log) {
        console.error(`authorId=${article.file.authorId} title=${article.titleRender}`);
      }
      await article.rerender()
    }
  }

  Article.prototype.getSlug = function() {
    return this.slug
  }

  /**
   * Calculate nested sets from Ref information update database with those values.
   * 
   * @param {string} username
   */
  Article.updateNestedSets = async function(username, opts={}) {
    const nestedSet = await Article.getNestedSetsFromRefs(username)
    const vals = nestedSet.map(s => { return {
      slug: s.id.slice(ourbigbook.AT_MENTION_CHAR.length),
      nestedSetIndex: s.nestedSetIndex,
      nestedSetNextSibling: s.nestedSetNextSibling,
    }})
    return sequelize.transaction({ transaction: opts.transaction }, async (transaction) => {
      for (const val of vals) {
        await sequelize.models.Article.update(
          {
            nestedSetIndex: val.nestedSetIndex,
            nestedSetNextSibling: val.nestedSetNextSibling,
          },
          {
            transaction,
            where: { slug: val.slug },
          },
        )
      }
    })
    // Would be nice, but doesn't work because of NOT NULL columns:
    // https://stackoverflow.com/questions/48816629/on-conflict-do-nothing-in-postgres-with-a-not-null-constraint
    //return Article.bulkCreate(
    //  vals,
    //  {
    //    updateOnDuplicate: [
    //      'nestedSetIndex',
    //      'nestedSetNextSibling',
    //    ]
    //  }
    //)
  }

  return Article
}
