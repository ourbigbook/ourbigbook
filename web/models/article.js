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
      author: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.file.author
        },
        set(value) {
          throw new Error('cannot set virtual`author` value directly');
        }
      }
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

  Article.prototype.toJson = async function(loggedInUser) {
    const authorPromise = this.file && this.file.author ? this.file.author : this.getAuthor()
    const [liked, author] = await Promise.all([
      loggedInUser ? loggedInUser.hasLikedArticle(this.id) : false,
      (await authorPromise).toJson(loggedInUser),
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
        path: ourbigbook.path_splitext(file.path.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR))[0],
        render: true,
        sequelize,
        titleSource: file.titleSource,
        transaction,
      })
    })
  }

  Article.prototype.isToplevelIndex = function(user) {
    return this.slug === user.username
  }

  Article.getArticle = async function({
    includeIssues,
    includeIssuesOrder,
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
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
      order = [[
        'issues', includeIssuesOrder === undefined ? 'createdAt' : includeIssuesOrder, 'DESC'
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
    slug,
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
        as: 'articleLikedBy',
        where: { username: likedBy },
      })
    }
    if (slug) {
      where.slug = slug
    }
    if (topicId) {
      where.topicId = topicId
    }
    const orderList = [[order, 'DESC']]
    if (order !== 'createdAt') {
      // To make results deterministic.
      orderList.push(['createdAt', 'DESC'])
    }
    return sequelize.models.Article.findAndCountAll({
      where,
      order: orderList,
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
