const crypto = require('crypto')
const Sequelize = require('sequelize')
const jwt = require('jsonwebtoken')

const ourbigbook = require('ourbigbook')

const convert = require('../convert')
const { cant } = require('../front/cant')
const config = require('../front/config')

const { DataTypes, Op } = Sequelize

sampleUsername = ', here is a good example: my-good-username-123'

module.exports = (sequelize) => {
  let User = sequelize.define(
    'User',
    {
      username: {
        type: DataTypes.STRING(config.usernameMaxLength),
        unique: {
          msg: 'This username is taken.'
        },
        validate: {
          len: {
            args: [config.usernameMinLength, config.usernameMaxLength],
            msg: `Usernames must be between ${config.usernameMinLength} and ${config.usernameMaxLength} characters`
          },
          is: {
            args: /^[a-z]/,
            msg: 'Usernames must start with a letter lowercase letter (a-z)' + sampleUsername
          },
          isNotReserved(value) {
            if (value in config.reservedUsernames) {
              throw new Error(`This username is reserved: ${value}`)
            }
            if (/[^a-z0-9-]/.test(value)) {
              throw new Error('Usernames can only contain lowercase letters (a-z), numbers (0-9) and dashes (-)' + sampleUsername)
            }
            if (/--/.test(value)) {
              throw new Error('Usernames cannot contain a double dash (-)' + sampleUsername)
            }
            if (/-$/.test(value)) {
              throw new Error('Usernames cannot end in a dash (-)' + sampleUsername)
            }
          },
        }
      },
      ip: {
        // IP user account was created from.
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
      score: {
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
      verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      verificationCode: {
        type: DataTypes.STRING(1024),
        allowNull: false,
      },
      verificationCodeSent: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      maxArticles: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxArticles,
      },
      maxArticleSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxArticleSize,
      },

      // A more general way would be to have a separate limits table.
      // with custom times KISS this time.
      maxIssuesPerMinute: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxIssuesPerMinute,
      },
      maxIssuesPerHour: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: config.maxIssuesPerHour,
      },

      emailNotifications: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      newScoreLastCheck: {
        // Last time the user checked for new upvotes received.
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      hooks: {
        beforeValidate: (user, options) => {
          user.verificationCode = crypto.randomBytes(sequelize.models.User.tableAttributes.verificationCode.type.options.length / 2).toString('hex')
          options.fields.push('verificationCode');
        },
        afterCreate: async (user, options) => {
          // Create the index page for the user.
          return convert.convertArticle({
            author: user,
            bodySource: User.defaultIndexBody,
            path: ourbigbook.INDEX_BASENAME_NOEXT,
            sequelize,
            titleSource: ourbigbook.capitalize_first_letter(ourbigbook.INDEX_BASENAME_NOEXT),
            transaction: options.transaction
          })
        }
      },
      indexes: [
        { fields: ['admin'] },
        { fields: ['createdAt'] },
        { fields: ['email'] },
        { fields: ['followerCount'] },
        { fields: ['score'] },
        { fields: ['username'] },
      ]
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
      effectiveImage: this.image || config.defaultProfileImage,
      followerCount: this.followerCount,
      score: this.score,
      admin: this.admin,
      createdAt: this.createdAt.toISOString(),
      // Until there are ever private articles/paid plans, you can always get
      // a lower bound on their capacities. Let's just make them public for now then.
      maxArticles: this.maxArticles,
      maxArticleSize: this.maxArticleSize,
      maxIssuesPerMinute: this.maxIssuesPerMinute,
      maxIssuesPerHour: this.maxIssuesPerHour,
      verified: this.verified,
    }
    if (loggedInUser) {
      ret.following = await loggedInUser.hasFollow(this.id)
      // Private data.
      if (!cant.viewUserSettings(loggedInUser, this)) {
        ret.ip = this.ip
        ret.email = this.email
        ret.emailNotifications = this.emailNotifications
        if (loggedInUser.token) {
          ret.token = loggedInUser.token
        }
        if (this.newScoreLastCheck) {
          ret.newScoreLastCheck = this.newScoreLastCheck.toISOString()
        }
      }
    } else {
      ret.following = false
    }
    return ret
  }

  User.findArticleLikesReceivedArgs = function(uid, opts={}) {
    let { order, offset, since } = opts
    if (offset === undefined) {
      offset = 0
    }
    if (order === undefined) {
      order = 'createdAt'
    }
    const args = {
      include: [
        {
          model: sequelize.models.Article,
          as: 'article',
          required: true,
          subQuery: false,
          include: [{
            model: sequelize.models.File,
            as: 'file',
            required: true,
            subQuery: false,
            include: [{
              model: sequelize.models.User,
              as: 'author',
              where: { id: uid },
              required: true,
              subQuery: false,
            }]
          }]
        },
        {
          model: sequelize.models.User,
          as: 'user',
          required: true,
          subQuery: false,
        },
      ],
      order: [[order, 'DESC']],
      offset,
    }
    if (since) {
      args.where = { createdAt: { [Op.gt]: since } }
    }
    return args
  }

  User.findAndCountArticleLikesReceived = async function(uid, opts={}) {
    return sequelize.models.UserLikeArticle.findAndCountAll(this.findArticleLikesReceivedArgs(uid, opts))
  }

  User.countArticleLikesReceived = async function(uid, opts={}) {
    return sequelize.models.UserLikeArticle.count(this.findArticleLikesReceivedArgs(uid, opts))
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

  User.prototype.addArticleFollowSideEffects = async function(article, opts={}) {
    return this.addFollowedArticle(article.id, { transaction: opts.transaction })
  }

  User.prototype.removeArticleFollowSideEffects = async function(article, opts={}) {
    return this.removeFollowedArticle(article.id, { transaction: opts.transaction })
  }

  /** If already following, do nothing. */
  User.prototype.addIssueFollowSideEffects = async function(article, opts={}) {
    return this.addFollowedIssue(article.id, { transaction: opts.transaction })
  }

  User.prototype.removeIssueFollowSideEffects = async function(article, opts={}) {
    return this.removeFollowedIssue(article.id, { transaction: opts.transaction })
  }

  User.prototype.addArticleLikeSideEffects = async function(article, opts={}) {
    const transaction = opts.transaction
    return this.addLikedArticle(article.id, { transaction }).then(
      // Update the article topic, possibly updating the preferred title.
      // Needs to come after score has been updated. Article score has been
      // updated with trigger at this point.
      () => sequelize.models.Topic.updateTopics([ article ], { transaction })
    )
  }

  User.prototype.removeArticleLikeSideEffects = async function(article, opts={}) {
    const transaction = opts.transaction
    return this.removeLikedArticle(article.id, { transaction }).then(
      () => sequelize.models.Topic.updateTopics([ article ], { transaction })
    )
  }

  User.prototype.addIssueLikeSideEffects = async function(article, opts={}) {
    return this.addLikedIssue(article.id, { transaction: opts.transaction })
  }

  User.prototype.removeIssueLikeSideEffects = async function(article, opts={}) {
    return this.removeLikedIssue(article.id, { transaction: opts.transaction })
  }
  User.prototype.addFollowSideEffects = async function(otherUser, opts={}) {
    return this.addFollow(otherUser.id, { transaction: opts.transaction })
  }

  User.prototype.removeFollowSideEffects = async function(otherUser, opts={}) {
    return this.removeFollow(otherUser.id, { transaction: opts.transaction })
  }

  User.prototype.saveSideEffects = async function(options = {}) {
    const transaction = options.transaction
    return this.save({ transaction })
  }

  User.prototype.canEditIssue = function(issue) {
    return issue.authorId === this.id
  }

  User.defaultIndexTitle = 'Index'
  User.defaultIndexBody = 'Welcome to my home page!\n'

  User.getUsers = async function({
    limit,
    following,
    followedBy,
    offset,
    order,
    sequelize,
    username,
  }) {
    const include = []
    if (following) {
      include.push({
        model: sequelize.models.User,
        as: 'follows',
        where: { username: following },
        attributes: [],
        through: { attributes: [] }
      })
    }
    if (followedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'followed',
        where: { username: followedBy },
        attributes: [],
        through: { attributes: [] }
      })
    }
    const orderList = [[order, 'DESC']]
    const where = {}
    if (username) {
      where.username = username
    }
    if (order !== 'createdAt') {
      // To make results deterministic.
      orderList.push(['createdAt', 'DESC'])
    }
    return sequelize.models.User.findAndCountAll({
      include,
      limit,
      offset,
      order: orderList,
      subQuery: false,
      where,
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
