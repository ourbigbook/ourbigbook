const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Comment = sequelize.define(
    'Comment',
    {
      body: DataTypes.STRING
    }
  )

  Comment.prototype.toJSONFor = async function(user) {
    return {
      id: this.id,
      body: this.body,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      author: (await this.author.toProfileJSONFor(user))
    }
  }
  return Comment
}
