const { DataTypes } = require('sequelize')

const config = require('../front/config')
const { getCommentSlug } = require('../front/js')
const convert = require('../convert')

module.exports = (sequelize) => {
  const Comment = sequelize.define(
    'Comment',
    {
      // OurBigBook Markup source of the comment.
      source: DataTypes.TEXT,
      // Rendered comment.
      render: DataTypes.TEXT,
      // User-visible numeric identifier for the issue. 1-based.
      number: DataTypes.INTEGER,
      // Upvote count.
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      indexes: [
        {
          fields: ['issueId', 'number'],
          unique: true,
        },

        // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
        { fields: ['issueId'], },
        { fields: ['authorId'], },

        // Efficient global listings.
        { fields: ['createdAt'], },
        { fields: ['updatedAt'], },

        // Efficient listing of issues by a given user.
        { fields: ['authorId', 'createdAt'], },
        { fields: ['authorId', 'updatedAt'], },
      ],
    },
  )

  Comment.createSideEffects = async function(author, issue, fields, opts={}) {
    return sequelize.transaction({ transaction: opts.transaction }, async (transaction) => {
      const [comment, newIssue] = await Promise.all([
        sequelize.models.Comment.create(
          Object.assign({ authorId: author.id, issueId: issue.id }, fields),
          { transaction }
        ),
        await author.addIssueFollowSideEffects(issue, { transaction }),
      ])
      return comment
    })
  }

  Comment.getComments = async function({
    authorId,
    articleId,
    issueId,
    limit,
    offset,
    order,
    transaction,
  }) {
    const where = {}
    if (authorId !== undefined) {
      where.authorId = authorId
    }
    if (order === undefined) {
      order = [['createdAt', 'DESC']]
    }
    const articleInclude = {
      model: sequelize.models.Article,
      as: 'article',
      required: true,
      subQuery: false,
    }
    if (articleId) {
      articleInclude.where = { id: articleId }
    }
    let issueIncludeWhere
    if (issueId) {
      issueIncludeWhere = { id: issueId }
    }
    return sequelize.models.Comment.findAndCountAll({
      include: [
        {
          model: sequelize.models.User,
          as: 'author',
        },
        {
          model: sequelize.models.Issue,
          as: 'issue',
          required: true,
          subQuery: false,
          where: issueIncludeWhere,
          include: [
            articleInclude
          ],
        },
      ],
      limit,
      offset,
      order,
      transaction,
      where,
    })
  }

  Comment.prototype.destroySideEffects = async function(fields, opts={}) {
    return this.destroy({ transaction: opts.transaction })
  }

  Comment.prototype.toJson = async function(loggedInUser) {
    const ret = {
      id: this.id,
      number: this.number,
      source: this.source,
      render: this.render,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      score: this.score,
    }
    const author = this.author
    if (author) {
      ret.author = await author.toJson(loggedInUser)
    }
    const issue = this.issue
    if (issue) {
      ret.issue = await issue.toJson(loggedInUser)
    }
    return ret
  }

  Comment.prototype.rerender = async function({ convertOptionsExtra, ignoreErrors, transaction }={}) {
    if (ignoreErrors === undefined)
      ignoreErrors = false
    await sequelize.transaction({ transaction }, async (transaction) => {
      try {
        await convert.convertComment({
          comment: this,
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

  Comment.rerender = async ({ convertOptionsExtra, ignoreErrors, log }={}) => {
    if (log === undefined)
      log = false
    let offset = 0
    while (true) {
      const comments = await sequelize.models.Comment.findAll({
        include: [
          {
            model: sequelize.models.Issue,
            as: 'issue',
            include: [{
              model: sequelize.models.Article,
              as: 'article',
            }]
          },
          {
            model: sequelize.models.User,
            as: 'author',
          }
        ],
        offset,
        limit: config.maxArticlesInMemory,
        order: [
          [{ model: sequelize.models.Issue, as: 'issue' }, { model: sequelize.models.Article, as: 'article' }, 'slug', 'ASC'],
          [{ model: sequelize.models.Issue, as: 'issue' }, 'number', 'ASC'],
          ['number', 'ASC']
        ],
      })
      if (comments.length === 0)
        break
      for (const comment of comments) {
        if (log)
          console.log(getCommentSlug(comment))
        await comment.rerender({ convertOptionsExtra, ignoreErrors })
      }
      offset += config.maxArticlesInMemory
    }
  }

  Comment.ALLOWED_SORTS_EXTRA = {}

  return Comment
}
