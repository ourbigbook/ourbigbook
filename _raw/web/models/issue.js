const assert = require('assert')

const { DataTypes } = require('sequelize')

const config = require('../front/config')
const convert = require('../convert')

module.exports = (sequelize) => {
  const Issue = sequelize.define(
    'Issue',
    {
      // OurBigBook Markup source for toplevel header title.
      titleSource: {
        type: DataTypes.TEXT,
        validate: {
          len: {
            args: [1, config.maxArticleTitleSize],
          },
        },
      },
      // OurBigBook Markup source for body without toplevel header title..
      bodySource: DataTypes.TEXT,
      // Rendered toplevel header title.
      titleRender: DataTypes.TEXT,
      // Full rendered output including toplevel h1.
      render: DataTypes.TEXT,
      // User-visible numeric identifier for the issue. 1-based.
      number: DataTypes.INTEGER,
      // Upvote count.
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      followerCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      commentCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      indexes: [
        {
          fields: ['articleId', 'number'],
          unique: true,
        },

        // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
        { fields: ['authorId'], },
        { fields: ['articleId'], },

        // Efficient global listings.
        { fields: ['createdAt'], },
        { fields: ['updatedAt'], },
        { fields: ['score'], },
        { fields: ['followerCount'], },
        { fields: ['commentCount'], },

        // Efficient listing of issues by a given user.
        { fields: ['authorId', 'createdAt'], },
        { fields: ['authorId', 'updatedAt'], },
        { fields: ['authorId', 'score'], },
        { fields: ['authorId', 'followerCount'], },
        { fields: ['authorId', 'commentCount'], },
      ],
    },
  )

  Issue.prototype.getAuthor = async function() {
    if (this.author === undefined) {
      return await this.getAuthor()
    } else {
      return this.author
    }
  }

  Issue.prototype.getSlug = function() {
    return `${this.article.getSlug()}#${this.number}`
  }

  Issue.prototype.rerender = async function({ convertOptionsExtra, ignoreErrors, transaction }={}) {
    if (ignoreErrors === undefined)
      ignoreErrors = false
    await sequelize.transaction({ transaction }, async (transaction) => {
      try {
        await convert.convertIssue({
          issue: this,
          sequelize,
          transaction,
          user: this.author,
        })
      } catch(e) {
        if (ignoreErrors) {
          console.log(e)
        } else {
          throw e
        }
      }
    })
  }

  Issue.prototype.toJson = async function(loggedInUser) {
    // TODO do liked and followed with JOINs on caller, check if it is there and skip this if so.
    const [followed, liked] = await Promise.all([
      loggedInUser ? await loggedInUser.hasFollowedIssue(this.id) : false,
      loggedInUser ? await loggedInUser.hasLikedIssue(this.id) : false,
    ])
    const ret = {
      id: this.id,
      number: this.number,
      commentCount: this.commentCount,
      followerCount: this.followerCount,
      followed,
      liked,
      titleSource: this.titleSource,
      bodySource: this.bodySource,
      score: this.score,
      titleRender: this.titleRender,
      render: this.render,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    }
    if (this.author) {
      ret.author = await this.author.toJson(loggedInUser)
    }
    if (this.article) {
      ret.article = await this.article.toJson(loggedInUser)
    }
    return ret
  }

  Issue.createSideEffects = async function(author, article, fields, opts={}) {
    const { transaction } = opts
    return sequelize.transaction({ transaction: opts.transaction }, async (transaction) => {
      const issue = await sequelize.models.Issue.create(
        Object.assign({ articleId: article.id, authorId: author.id }, fields),
        { transaction }
      )
      await author.addIssueFollowSideEffects(issue, { transaction })
      return issue
    })
  }

  Issue.getIssue = async function ({ includeComments, number, sequelize, slug }) {
    const include = [
      {
        model: sequelize.models.Article,
        as: 'article',
        where: { slug },
        include: [{
          model: sequelize.models.File,
          as: 'file',
        }]
      },
      { model: sequelize.models.User, as: 'author' },
    ]
    let order
    if (includeComments) {
      include.push({
        model: sequelize.models.Comment,
        as: 'comments',
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
      order = [[
        'comments', 'number', 'ASC'
      ]]
    }
    return await sequelize.models.Issue.findOne({
      where: { number },
      include,
      order,
      limit: config.articleLimit,
    })
  }

  Issue.getIssues = async ({
    author,
    followedBy,
    includeArticle,
    likedBy,
    limit,
    offset,
    order,
    orderAscDesc,
    sequelize,
    transaction,
  }) => {
    assert.notStrictEqual(sequelize, undefined)
    if (orderAscDesc === undefined) {
      orderAscDesc = 'DESC'
    }
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
      required: true,
    }
    if (author) {
      authorInclude.where = { username: author }
    }
    const include = [authorInclude]
    if (includeArticle) {
      include.push({
        model: sequelize.models.Article,
        as: 'article',
        include: [{
          model: sequelize.models.File,
          as: 'file',
          include: [{
            model: sequelize.models.User,
            as: 'author',
          }]
        }]
      })
    }
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
        as: 'issueLikedBy',
        where: { username: likedBy },
      })
    }
    if (likedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'issueLikedBy',
        where: { username: likedBy },
      })
    }
    const orderList = []
    if (order !== undefined) {
      orderList.push([order, orderAscDesc])
    }
    if (order !== 'createdAt') {
      // To make results deterministic.
      orderList.push(['createdAt', 'DESC'])
    }
    return sequelize.models.Issue.findAndCountAll({
      include,
      limit,
      offset,
      order: orderList,
      transaction,
    })
  }

  /** Re-render multiple issues. */
  Issue.rerender = async ({ convertOptionsExtra, ignoreErrors, log }={}) => {
    if (log === undefined)
      log = false
    let offset = 0
    while (true) {
      const issues = await sequelize.models.Issue.findAll({
        include: [
          {
            model: sequelize.models.Article,
            as: 'article',
          },
          {
            model: sequelize.models.User,
            as: 'author',
          }
        ],
        offset,
        limit: config.maxArticlesInMemory,
        order: [[{model: sequelize.models.Article, as: 'article'}, 'slug', 'ASC'], ['number', 'ASC']],
      })
      if (issues.length === 0)
        break
      for (const issue of issues) {
        if (log)
          console.log(issue.getSlug())
        await issue.rerender({ convertOptionsExtra, ignoreErrors })
      }
      offset += config.maxArticlesInMemory
    }
  }

  Issue.ALLOWED_SORTS_EXTRA = {
    'score': undefined,
    'follower-count': 'followerCount',
    'comments': 'commentCount',
  }

  return Issue
}
