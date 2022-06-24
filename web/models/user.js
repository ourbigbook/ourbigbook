const crypto = require('crypto')
const Sequelize = require('sequelize')
const jwt = require('jsonwebtoken')

const ourbigbook = require('ourbigbook')

const convert = require('../convert')
const config = require('../front/config')

const { DataTypes, Op } = Sequelize

sampleUsername = ', here is a good example: my-good-username-123'

module.exports = (sequelize) => {
  let User = sequelize.define(
    'User',
    {
      username: {
        type: DataTypes.STRING(config.usernameMaxLength),
        set(v) {
          this.setDataValue('username', v.toLowerCase())
        },
        unique: {
          msg: 'This username is taken.'
        },
        validate: {
          len: {
            args: [config.usernameMinLength, config.usernameMaxLength],
            msg: `Usernames must be between ${config.usernameMinLength} and ${config.usernameMaxLength} characters`
          },
          not: {
            args: /[^a-z0-9-]/,
            msg: 'Usernames can only contain lowercase letters (a-z), numbers (0-9) and dashes (-)' + sampleUsername
          },
          is: {
            args: /^[a-z]/,
            msg: 'Usernames must start with a letter lowercase letter (a-z)' + sampleUsername
          },
          not: {
            args: /--/,
            msg: 'Usernames cannot contain a double dash (-)' + sampleUsername
          },
          not: {
            args: /-$/,
            msg: 'Usernames cannot end in a dash (-)' + sampleUsername
          },
          isNotReserved(value) {
            if (value in config.reservedUsernames) {
              throw new Error(`This username is reserved: ${value}`);
            }
          },
        }
      },
      ip: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      displayName: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        set(v) {
          this.setDataValue('email', v.toLowerCase())
        },
        unique: {
          msg: 'This email is taken.'
        },
        validate: {
          isEmail: {
            msg: 'This email does not seem valid.'
          },
          max: {
            args: 254,
            msg: 'This email is too long, the maximum size is 254 characters.'
          }
        }
      },
      image: DataTypes.STRING(2048),
      hash: DataTypes.STRING(1024),
      salt: DataTypes.STRING,
      articleScoreSum: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      followerCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      admin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      hooks: {
        afterCreate: async (user, options) => {
          // Create the index page for the user.
          return convert.convertArticle({
            author: user,
            bodySource: User.defaultIndexBody,
            sequelize,
            titleSource: ourbigbook.capitalize_first_letter(ourbigbook.INDEX_BASENAME_NOEXT),
            transaction: options.transaction
          })
        }
      },
      indexes: [{ fields: ['username'] }, { fields: ['email'] }]
    }
  )

  User.prototype.generateJWT = function() {
    let today = new Date()
    let exp = new Date(today)
    exp.setDate(today.getDate() + 60)
    return jwt.sign(
      {
        id: this.id,
        username: this.username,
        exp: parseInt(exp.getTime() / 1000)
      },
      config.secret
    )
  },

  User.prototype.toJson = async function(loggedInUser) {
    const ret = {
      id: this.id,
      username: this.username,
      displayName: this.displayName,
      image: this.image,
      effectiveImage: this.image || 'https://static.productionready.io/images/smiley-cyrus.jpg',
      followerCount: this.followerCount,
      articleScoreSum: this.articleScoreSum,
    }
    if (loggedInUser) {
      ret.following = await loggedInUser.hasFollow(this.id)
      // Private data.
      if (this.username === loggedInUser.username) {
        ret.email = this.email
        if (loggedInUser.token) {
          ret.token = loggedInUser.token
        }
      }
    } else {
      ret.following = false
    }
    return ret
  }

  User.prototype.findAndCountArticlesByFollowed = async function(offset, limit, order) {
    if (!order) {
      order = 'createdAt'
    }
    return sequelize.models.Article.findAndCountAll({
      offset,
      limit,
      subQuery: false,
      order: [[
        order,
        'DESC'
      ]],
      include: [
        {
          model: sequelize.models.File,
          as: 'file',
          required: true,
          include: [
            {
              model: sequelize.models.User,
              as: 'author',
              required: true,
              include: [
                {
                  model: sequelize.models.UserFollowUser,
                  on: {
                    followId: { [Op.col]: 'file.author.id' },
                  },
                  attributes: [],
                  where: { userId: this.id },
                }
              ],
            }
          ],
        },
      ],
    })
  }

  User.prototype.findAndCountArticlesByFollowedToJson = async function (
    offset,
    limit,
    order
  ) {
    const { count: articlesCount, rows: articles } =
      await this.findAndCountArticlesByFollowed(offset, limit, order)
    const articlesJson = await Promise.all(
      articles.map((article) => {
        return article.toJson(this)
      })
    )
    return {
      articles: articlesJson,
      articlesCount,
    }
  }

  User.prototype.addLikeSideEffects = async function(article) {
    await sequelize.transaction(async transaction => {
      await Promise.all([
        this.addLike(article.id, { transaction }),
        article.getAuthor({ transaction }).then(author => author.increment('articleScoreSum', { transaction })),
        article.increment('score', { transaction }),
      ])
    })
  }

  User.prototype.removeLikeSideEffects = async function(article) {
    await sequelize.transaction(async transaction => {
      await Promise.all([
        this.removeLike(article.id, { transaction }),
        article.getAuthor().then(author => author.decrement('articleScoreSum', { transaction })),
        article.decrement('score', { transaction }),
      ])
    })
  }

  User.prototype.addFollowSideEffects = async function(otherUser) {
    await sequelize.transaction(async transaction => {
      await Promise.all([
        this.addFollow(otherUser.id, { transaction }),
        otherUser.increment('followerCount', { transaction }),
      ])
    })
  }

  User.prototype.saveSideEffects = async function(options = {}) {
    const transaction = options.transaction
    await sequelize.transaction({ transaction }, async (transaction) => {
      return this.save({ transaction })
    })
  }

  User.prototype.removeFollowSideEffects = async function(otherUser) {
    await sequelize.transaction(async transaction => {
      await Promise.all([
        this.removeFollow(otherUser.id, { transaction }),
        otherUser.decrement('followerCount', { transaction }),
      ])
    })
  }

  User.defaultIndexTitle = 'Index'
  User.defaultIndexBody = 'Welcome to my home page!'

  User.validPassword = function(user, password) {
    let hash = crypto.pbkdf2Sync(password, user.salt, 10000, 512, 'sha512').toString('hex')
    return user.hash === hash
  }

  User.setPassword = function(user, password) {
    user.salt = crypto.randomBytes(16).toString('hex')
    user.hash = crypto.pbkdf2Sync(password, user.salt, 10000, 512, 'sha512').toString('hex')
  }

  return User
}
