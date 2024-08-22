import { getCookieFromReq } from 'front'
import { AUTH_COOKIE_NAME } from 'front/js'
import { verify } from 'jsonwebtoken'
import { secret } from 'front/config'

export async function getLoggedInUser(req, res, loggedInUser?) {
  if (loggedInUser !== undefined) {
    return loggedInUser
  } else {
    const authCookie = getCookieFromReq(req, AUTH_COOKIE_NAME)
    let verifiedUser
    if (authCookie) {
      try {
        verifiedUser = verify(authCookie, secret)
      } catch (e) {
        return null
      }
    } else {
      return null
    }
    const sequelize = req.sequelize
    const User = sequelize.models.User
    const user = await User.findByPk(
      verifiedUser.id,
      {
        attributes: {
          include: [
            [
              sequelize.fn(
                'count',
                sequelize.col('authoredArticles->articles->likes.articleId')
              ),
              'scoreDelta'
            ],
          ],
        },
        group: ['User.id'],
        include: [{
          model: sequelize.models.File,
          as: 'authoredArticles',
          required: false,
          subQuery: false,
          attributes: [],
          include: [{
            model: sequelize.models.Article,
            as: 'articles',
            required: false,
            subQuery: false,
            attributes: [],
            include: [{
              model: sequelize.models.UserLikeArticle,
              as: 'likes',
              attributes: [],
              required: false,
              subQuery: false,
              where: { createdAt: { [sequelize.Sequelize.Op.gt]: sequelize.col('User.newScoreLastCheck')} },
            }]
          }]
        }]
      }
    )

    if (user === null) {
      res.clearCookie(AUTH_COOKIE_NAME)
    } else {
      user.scoreDelta = user.get('scoreDelta')
    }
    return user
  }
}
