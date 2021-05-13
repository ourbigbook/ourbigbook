const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Comment = sequelize.define(
    'Comment',
    {
      body: DataTypes.STRING
    },
    {
      underscored: true,
      tableName: 'comments'
    }
  )

  Comment.associate = function() {
    Comment.belongsTo(sequelize.models.User, {
      as: 'Author',
      foreignKey: {
        allowNull: false
      },
    });
    Comment.belongsTo(sequelize.models.Article, {
      foreignKey: {
        allowNull: false
      },
    });
  }

  Comment.prototype.toJSONFor = function(author, user) {
    return {
      id: this.id,
      body: this.body,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      author: author.toProfileJSONFor(author, user)
    }
  }
  return Comment
}
