const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
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
    const file = await this.getFile({ include: [ { model: sequelize.models.User, as: 'author' } ]})
    return file.author
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
