const { DataTypes } = require('sequelize')

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
