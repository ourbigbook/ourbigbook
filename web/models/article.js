const cirodown = require('cirodown')
const { DataTypes, Op } = require('sequelize')

const { modifyEditorInput } = require('../lib/shared')

module.exports = (sequelize) => {
  const Article = sequelize.define(
    'Article',
    {
      // E.g. `johnsmith/mathematics`.
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
      // E.g. for `johnsmith/mathematics` this is just the `mathematics`.
      // Can't be called just `id`, sequelize complains that it is not a primary key with that name.
      topicId: {
        type: DataTypes.STRING,
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
          // https://github.com/sequelize/sequelize/issues/8586#issuecomment-422877555
          options.fields.push('render');
          const id = extra_returns.context.header_graph.children[0].value.id
          article.topicId = id
          options.fields.push('topicId')
          if (!article.slug) {
            const author = await article.getAuthor()
            article.slug = Article.makeSlug(author.username, id)
            options.fields.push('slug')
          }
        }
      },
      // TODO for sorting by latest.
      indexes: [
        {
          fields: ['createdAt'],
        },
        {
          fields: ['topicId'],
        },
        {
          fields: ['slug'],
        },
      ],
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
      topicId: this.topicId,
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
