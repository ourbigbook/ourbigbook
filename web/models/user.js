const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const config = require('../config')

const Sequelize = require('sequelize')
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
          args: true,
          message: 'Username must be unique.'
        },
        validate: {
          len: [config.usernameMinLength, config.usernameMaxLength],
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
      email: {
        type: DataTypes.STRING,
        set(v) {
          this.setDataValue('email', v.toLowerCase())
        },
        unique: {
          args: true,
          msg: 'This email has already been registered'
        },
        validate: {
          isEmail: {
            args: true,
          },
          max: {
            args: 254,
          }
        }
      },
      bio: DataTypes.STRING,
      image: DataTypes.STRING,
      hash: DataTypes.STRING(1024),
      salt: DataTypes.STRING,
      articleScoreSum: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      followerCount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
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
      username: this.username,
      bio: this.bio === undefined ? '' : this.bio,
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

  User.prototype.findAndCountArticlesByFollowed = async function(offset, limit) {
    return sequelize.models.Article.findAndCountAll({
      offset: offset,
      limit: limit,
      subQuery: false,
      order: [[
        'createdAt',
        'DESC'
      ]],
      include: [
        {
          model: sequelize.models.User,
          as: 'author',
          required: true,
          include: [
            {
              model: sequelize.models.UserFollowUser,
              on: {
                followId: {[Op.col]: 'author.id' },
              },
              attributes: [],
              where: {userId: this.id},
            }
          ],
        },
      ],
    })
  }

  User.prototype.getArticleCountByFollowed = async function() {
    return (await User.findByPk(this.id, {
      subQuery: false,
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('follows.authoredArticles.id')), 'count']
      ],
      include: [
        {
          model: User,
          as: 'follows',
          attributes: [],
          through: {attributes: []},
          include: [{
              model: sequelize.models.Article,
              as: 'authoredArticles',
              attributes: [],
          }],
        },
      ],
    })).dataValues.count
  }

  User.prototype.addFavoriteSideEffects = async function(article) {
    await sequelize.transaction(async t => {
      await Promise.all([
        this.addFavorite(article.id, { transaction: t }),
        this.increment('articleScoreSum', { transaction: t }),
        article.increment('score', { transaction: t }),
      ])
    })
  }

  User.prototype.removeFavoriteSideEffects = async function(article) {
    await sequelize.transaction(async t => {
      await Promise.all([
        this.removeFavorite(article.id, { transaction: t }),
        this.decrement('articleScoreSum', { transaction: t }),
        article.decrement('score', { transaction: t }),
      ])
    })
  }

  User.prototype.addFollowSideEffects = async function(otherUser) {
    await sequelize.transaction(async t => {
      await Promise.all([
        this.addFollow(otherUser.id, { transaction: t }),
        otherUser.increment('followerCount', { transaction: t }),
      ])
    })
  }

  User.prototype.removeFollowSideEffects = async function(otherUser) {
    await sequelize.transaction(async t => {
      await Promise.all([
        this.removeFollow(otherUser.id, { transaction: t }),
        otherUser.decrement('followerCount', { transaction: t }),
      ])
    })
  }

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
