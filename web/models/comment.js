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
    },
    {
      indexes: [{ fields: ['number'] }],
    },
  )

  Comment.prototype.toJson = async function(loggedInUser) {
    return {
      id: this.id,
      number: this.number,
      source: this.source,
      render: this.source,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      author: (await this.author.toJson(loggedInUser))
    }
  }
  return Comment
}
