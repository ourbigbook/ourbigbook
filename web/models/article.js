const cirodown = require('cirodown')
const { DataTypes, Op } = require('sequelize')

const { modifyEditorInput } = require('../shared')
const { update_database_after_convert, SqliteIdProvider } = require('cirodown/nodejs_webpack_safe')

module.exports = (sequelize) => {
  const id_provider = new SqliteIdProvider(sequelize)
  const Article = sequelize.define(
    'Article',
    {
      // E.g. `johnsmith/mathematics`.
      slug: {
        type: DataTypes.STRING,
        unique: {
          message: 'The article ID must be unique.'
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
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      hooks: {
        beforeValidate: async (article, options) => {
          let extra_returns = {};
          const author = await article.getAuthor()
          article.render = await cirodown.convert(
            modifyEditorInput(article.title, article.body),
            {
              body_only: true,
              html_x_extension: false,
              id_provider,
              input_path: cirodown.title_to_id(article.title) + cirodown.CIRODOWN_EXT,
              read_include: (id) => {
                const included_article = sequelize.models.Article.findOne({ where: { slug: Article.makeSlug(author.username, id) } }) 
                let found = undefined;
                if (included_article) {
                  return [id, included_article.body]
                } else {
                  return undefined
                }
              },
            },
            extra_returns,
          )
          const id = extra_returns.context.header_tree.children[0].ast.id
          await update_database_after_convert({
            extra_returns,
            id_provider,
            sequelize,
            path: id,
            render: true,
          })
          // https://github.com/sequelize/sequelize/issues/8586#issuecomment-422877555
          options.fields.push('render');
          article.topicId = id
          options.fields.push('topicId')
          if (!article.slug) {
            article.slug = Article.makeSlug(author.username, id)
            options.fields.push('slug')
          }
        }
      },
      // TODO updatedAt lazy to create migration now.
      indexes: [
        { fields: ['createdAt'], },
        { fields: ['topicId'], },
        { fields: ['slug'], },
        { fields: ['score'], },
      ],
    }
  )

  Article.prototype.toJson = async function(user) {
    const authorPromise = this.author ? this.author : this.getAuthor()
    const [liked, author] = await Promise.all([
      user ? user.hasLike(this.id) : false,
      (await authorPromise).toJson(user),
    ])
    return {
      id: this.id,
      slug: this.slug,
      topicId: this.topicId,
      title: this.title,
      body: this.body,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      liked,
      score: this.score,
      author,
      render: this.render,
    }
  }

  Article.makeSlug = (uid, pid) => {
    return `${uid}/${pid}`
  }

  // Helper for common queries.
  Article.getArticles = async ({ sequelize, limit, offset, author, likedBy, topicId, order }) => {
    let where = {}
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
    }
    if (author) {
      authorInclude.where = { username: author }
    }
    const include = [authorInclude]
    if (likedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'likedBy',
        where: {username: likedBy},
      })
    }
    if (topicId) {
      where.topicId = topicId
    }
    return sequelize.models.Article.findAndCountAll({
      where: where,
      order: [[order, 'DESC']],
      limit: Number(limit),
      offset: Number(offset),
      include: include,
    })
  }

  return Article
}
