const cirodown = require('cirodown')
const { DataTypes, Op } = require('sequelize')

const { modifyEditorInput } = require('../lib/shared')

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
        },
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      body: {
        type: DataTypes.STRING(2**20),
        allowNull: false,
      },
      render: {
        type: DataTypes.STRING(2**20),
        allowNull: false,
      },
    },
    {
      hooks: {
        beforeValidate: async (article, options) => {
          let extra_returns = {};
          article.render = cirodown.convert(
            modifyEditorInput(article.title, article.body),
            {
              body_only: true,
            },
            extra_returns,
          )
          const id = extra_returns.context.header_graph.children[0].value.id
          const author = await article.getAuthor()
          if (!article.slug) {
            article.slug = Article.makeSlug(author.username, id)
          }
        }
      },
      // TODO for sorting by latest.
      //indexes: [
      //  {
      //    fields: ['createdAt'],
      //  },
      //],
    }
  )

  Article.prototype.toJSONFor = async function(user) {
    let authorPromise;
    if (this.authorPromise === undefined) {
      authorPromise = this.getAuthor()
    } else {
      authorPromise = new Promise(resolve => {resolve(this.author)})
    }
    const [tags, favorited, favoritesCount, author] = await Promise.all([
      this.getTags(),
      user ? user.hasFavorite(this.id) : false,
      this.countFavoritedBy(),
      authorPromise.then(author => author.toProfileJSONFor(user)),
    ])
    return {
      slug: this.slug,
      title: this.title,
      body: this.body,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      tagList: tags.map(tag => tag.name),
      favorited,
      favoritesCount,
      author,
      render: this.render,
    }
  }

  Article.makeSlug = (uid, pid) => {
    return `${uid}/${pid}`
  }

  return Article
}
