const path = require('path')

const cirodown = require('cirodown')
const cirodown_nodejs_webpack_safe = require('cirodown/nodejs_webpack_safe')
const { DataTypes, Op } = require('sequelize')

const { modifyEditorInput } = require('../shared')
const { ValidationError } = require('../api/lib')
const {
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqliteFileProvider,
  SqliteIdProvider,
} = require('cirodown/nodejs_webpack_safe')

module.exports = (sequelize) => {
  const id_provider = new SqliteIdProvider(sequelize)
  const file_provider = new SqliteFileProvider(sequelize, id_provider);
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
          const transaction = options.transaction
          let extra_returns = {};
          const author = await article.getAuthor()
          const id = cirodown.title_to_id(article.title)
          const input = modifyEditorInput(article.title, article.body)
          article.render = await cirodown.convert(
            input,
            {
              body_only: true,
              html_x_extension: false,
              id_provider,
              file_provider,
              magic_leading_at: false,
              input_path: `${cirodown.AT_MENTION_CHAR}${author.username}/${id}${cirodown.CIRODOWN_EXT}`,
              path_sep: path.sep,
              read_include: cirodown_nodejs_webpack_safe.read_include({
                exists: async (inpath) => {
                  const suf = cirodown.Macro.HEADER_SCOPE_SEPARATOR + cirodown.INDEX_BASENAME_NOEXT
                  let idid
                  if (inpath.endsWith(suf)) {
                    idid = inpath.slice(0, -suf.length)
                  } else {
                    idid = inpath
                  }
                  return (await sequelize.models.Id.count({ where: { idid }, transaction })) > 0
                },
                // Only needed for --embed-includes, which is not implemented on the dynamic website for now.
                read: (inpath) => '',
                path_sep: cirodown.Macro.HEADER_SCOPE_SEPARATOR,
                ext: '',
              }),
              remove_leading_at: true,
            },
            extra_returns,
          )
          if (extra_returns.errors.length > 0) {
            const errsNoDupes = remove_duplicates_sorted_array(
              extra_returns.errors.map(e => e.toString()))
            throw new ValidationError(errsNoDupes, 422)
          }
          const idid = extra_returns.context.header_tree.children[0].ast.id
          await update_database_after_convert({
            extra_returns,
            id_provider,
            sequelize,
            path: idid,
            render: true,
            transaction,
          })
          // https://github.com/sequelize/sequelize/issues/8586#issuecomment-422877555
          options.fields.push('render');
          article.topicId = idid.slice(cirodown.AT_MENTION_CHAR.length + author.username.length + 1)
          options.fields.push('topicId')
          if (!article.slug) {
            article.slug = `${idid.slice(cirodown.AT_MENTION_CHAR.length)}`
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

  Article.prototype.saveSideEffects = async function() {
    await sequelize.transaction(async (transaction) => {
      return this.save({ transaction })
    })
  }

  Article.prototype.isToplevelIndex = function(user) {
    return this.slug === user.username
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
