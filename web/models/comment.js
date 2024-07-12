const { DataTypes } = require('sequelize')

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

  return Comment
}
