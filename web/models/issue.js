const { DataTypes } = require('sequelize')

const api_lib = require('../api/lib')
const config = require('../front/config')

module.exports = (sequelize) => {
  const Issue = sequelize.define(
    'Issue',
    {
      // OurBigBook Markup source for toplevel header title.
      titleSource: DataTypes.STRING(512),
      // OurBigBook Markup source for body withotu toplevel header title..
      bodySource: DataTypes.TEXT,
      // Rendered toplevel header title.
      titleRender: DataTypes.TEXT,
      // Full rendered output.
      render: DataTypes.TEXT,
      // User-visible numeric identifier for the issue. 1-based.
      number: DataTypes.INTEGER,
    },
    {
      indexes: [{ fields: ['articleId', 'number'] }],
    },
  )

  Issue.getIssue = async function ({ includeComments, number, sequelize, slug }) {
    const include = [{
      model: sequelize.models.Article,
      as: 'issues',
      where: { slug },
    }]
    let order
    if (includeComments) {
      include.push({
        model: sequelize.models.Comment,
        as: 'comments',
        order: [['number', 'DESC']],
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
      order = [[
        'comments', 'number', 'DESC'
      ]]
    }
    return await sequelize.models.Issue.findOne({
      where: { number },
      include,
      order,
      limit: config.articleLimit,
    })
  }

  Issue.prototype.toJson = async function(loggedInUser) {
    return {
      id: this.id,
      number: this.number,
      titleSource: this.titleSource,
      bodySource: this.bodySource,
      titleRender: this.titleRender,
      render: this.render,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      author: (await this.author.toJson(loggedInUser))
    }
  }

  return Issue
}
