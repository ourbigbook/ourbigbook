const cirodown = require('cirodown')
const slug = require('slug')
const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
  const Article = sequelize.define(
    'Article',
    {
      slug: {
        type: DataTypes.STRING,
        unique: {
          args: true,
          message: 'Slug must be unique.'
        },
        set(v) {
          this.setDataValue('slug', v.toLowerCase())
        }
      },
      title: DataTypes.STRING,
      body: DataTypes.STRING,
      favoritesCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'favorites_count'
      },
      tagList: {
        type: DataTypes.STRING,
        field: 'tag_list',
        set(v) {
          this.setDataValue('tagList', Array.isArray(v) ? v.join(',') + ',-' : '')
        },
        get() {
          const tagList = this.getDataValue('tagList')
          if (!tagList) return []
          return tagList.split(',').slice(0, -1)
        }
      }
    },
    {
      underscored: true,
      tableName: 'articles',
      hooks: {
        beforeValidate: (article, options) => {
          if (!article.slug) {
            article.slug = slug(article.title) + '-' + ((Math.random() * Math.pow(36, 6)) | 0).toString(36)
          }
        }
      }
    }
  )

  Article.associate = function() {
    Article.belongsTo(sequelize.models.User, {
      as: 'Author',
      foreignKey: {
        allowNull: false
      }
    })
    Article.hasMany(sequelize.models.Comment)
  }

  Article.prototype.updateFavoriteCount = function() {
    let article = this
    return sequelize.models.User.count({ where: { favorites: { [Op.in]: [article.id] } } }).then(function(count) {
      article.favoritesCount = count
      return article.save()
    })
  }

  Article.prototype.toJSONFor = function(author, user) {
    return {
      slug: this.slug,
      title: this.title,
      body: this.body,
      // Stringify here otherwise: `object` ("[object Date]") cannot be serialized as JSON.
      // https://github.com/vercel/next.js/discussions/11498
      // https://github.com/vercel/next.js/discussions/13696
      // https://github.com/vercel/next.js/issues/11993
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      tagList: this.tagList,
      favorited: user ? user.isFavorite(this.id) : false,
      favoritesCount: this.favoritesCount,
      author: author.toProfileJSONFor(user),
      render: cirodown.convert('= ' + this.title + '\n\n' + this.body, {body_only: true}),
    }
  }

  return Article
}
