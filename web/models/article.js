const { DataTypes, Op } = require('sequelize')

const ourbigbook = require('ourbigbook')

const config = require('../front/config')
const convert = require('../convert')

module.exports = (sequelize) => {
  // Each Article contains rendered HTML output, analogous to a .html output file in OurBigBook CLI.
  // The input source is stored in the File model. A single file can then generate
  // multiple Article if it has multiple headers.
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
      // Rendered title.
      titleRender: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered full article.
      render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      // TODO updatedAt lazy to create migration now.
      indexes: [
        { fields: ['createdAt'], },
        { fields: ['topicId'], },
        { fields: ['slug'], },
        { fields: ['score'], },
      ],
    }
  )

  Article.prototype.getAuthor = async function() {
    return (await this.getFileCached()).author
  }

  Article.prototype.getFileCached = async function() {
    let file
    if (!this.file || this.file.author === undefined) {
      file = await this.getFile({ include: [ { model: sequelize.models.User, as: 'author' } ]})
    } else {
      file = this.file
    }
    return file
  }

  Article.prototype.toJson = async function(user) {
    const authorPromise = this.file && this.file.author ? this.file.author : this.getAuthor()
    const [liked, author] = await Promise.all([
      user ? user.hasLike(this.id) : false,
      (await authorPromise).toJson(user),
    ])
    return {
      id: this.id,
      slug: this.slug,
      topicId: this.topicId,
      titleRender: this.titleRender,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      liked,
      score: this.score,
      // Putting it here rather than in the more consistent file.author
      // to improve post serialization polymorphism with issues.
      author,
      file: {
        titleSource: this.file.titleSource,
        bodySource: this.file.bodySource,
        path: this.file.path,
      },
      render: this.render,
    }
  }

  Article.prototype.rerender = async function(options = {}) {
    const file = await this.getFileCached()
    const transaction = options.transaction
    await sequelize.transaction({ transaction }, async (transaction) => {
      await convert.convertArticle({
        author: file.author,
        bodySource: file.bodySource,
        forceNew: false,
        path: file.path.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR),
        render: true,
        sequelize,
        titleSource: file.titleSource,
        transaction,
      })
    })
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

  Article.getArticle = async function({
    includeIssues,
    limit,
    sequelize,
    slug,
  }) {
    if (limit === undefined) {
      limit = config.articleLimit
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: [{
        model: sequelize.models.User,
        as: 'author',
      }]
    }]
    let order
    if (includeIssues) {
      include.push({
        model: sequelize.models.Issue,
        as: 'issues',
        order: [['number', 'DESC']],
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
      order = [[
        'issues', 'number', 'DESC'
      ]]
    }
    return sequelize.models.Article.findOne({
      where: { slug },
      include,
      order,
      subQuery: false,
      limit,
    })
  }

  // Helper for common queries.
  Article.getArticles = async ({
    author,
    likedBy,
    limit,
    offset,
    order,
    sequelize,
    topicId,
  }) => {
    let where = {}
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
      required: true,
    }
    if (author) {
      authorInclude.where = { username: author }
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: [authorInclude],
      required: true,
    }]
    if (likedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'likedBy',
        where: { username: likedBy },
      })
    }
    if (topicId) {
      where.topicId = topicId
    }
    return sequelize.models.Article.findAndCountAll({
      where,
      order: [[order, 'DESC']],
      limit,
      offset,
      include,
    })
  }

  Article.rerender = async (opts={}) => {
    if (opts.log === undefined) {
      opts.log = false
    }
    const articles = await sequelize.models.Article.findAll({
      include: [ { model: sequelize.models.File, as: 'file' } ],
    })
    for (const article of articles) {
      if (opts.log) {
        console.error(`authorId=${article.file.authorId} title=${article.titleRender}`);
      }
      await article.rerender()
    }
  }

  return Article
}
