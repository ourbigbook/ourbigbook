const path = require('path')

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const { DataTypes, Op } = require('sequelize')

const { convertOptions } = require('../front/config')
const { modifyEditorInput } = require('../shared')
const { ValidationError } = require('../api/lib')
const {
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqliteFileProvider,
  SqliteIdProvider,
} = require('ourbigbook/nodejs_webpack_safe')

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
          await article.convert(options.transaction)
          options.fields.push('render')
          options.fields.push('topicId')
          options.fields.push('slug')
          options.fields.push('body')
        },
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

  Article.prototype.convert = async function(transaction) {
    const article = this
    const extra_returns = {};
    const author = await article.getAuthor({ transaction })
    const id = ourbigbook.title_to_id(article.title)
    article.body = article.body.replace(/\n+$/, '')
    const input = modifyEditorInput(article.title, article.body)
    const input_path = `${ourbigbook.AT_MENTION_CHAR}${author.username}/${id}${ourbigbook.OURBIGBOOK_EXT}`
    article.render = await ourbigbook.convert(
      input,
      Object.assign({
        id_provider,
        file_provider,
        input_path,
        read_include: ourbigbook_nodejs_webpack_safe.read_include({
          exists: async (inpath) => {
            const suf = ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + ourbigbook.INDEX_BASENAME_NOEXT
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
          path_sep: ourbigbook.Macro.HEADER_SCOPE_SEPARATOR,
          ext: '',
        }),
        remove_leading_at: true,
      }, convertOptions),
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
      path: `${idid}${ourbigbook.OURBIGBOOK_EXT}`,
      render: true,
      transaction,
    })
    const check_db_errors = await ourbigbook_nodejs_webpack_safe.check_db(
      sequelize,
      [input_path],
    )
    if (check_db_errors.length > 0) {
      throw new ValidationError(check_db_errors, 422)
    }
    // https://github.com/sequelize/sequelize/issues/8586#issuecomment-422877555
    article.topicId = idid.slice(ourbigbook.AT_MENTION_CHAR.length + author.username.length + 1)
    if (!article.slug) {
      article.slug = `${idid.slice(ourbigbook.AT_MENTION_CHAR.length)}`
    }
  }

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

  Article.prototype.saveSideEffects = async function(options = {}) {
    const transaction = options.transaction
    await sequelize.transaction({ transaction }, async (transaction) => {
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

  Article.rerender = async (opts={}) => {
    if (opts.log === undefined) {
      opts.log = false
    }
    for (const article of await sequelize.models.Article.findAll()) {
      if (opts.log) {
        console.error(`authorId=${article.authorId} title=${article.title}`);
      }
      await article.convert()
      await article.save()
    }
  }

  return Article
}
