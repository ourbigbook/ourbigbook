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
      // Get the new upvote count for the logged in user.
      // This was the slowest DB query as of commit 96c73b204ba498699bc241f61b78c441cd9885bf + 1.
      // at around 20ms locally for /cirosantilli on localhost. The total query time was 200-300 ms
      // however, so I was lazy to optimize it. This query is efficient, optimizing it further would
      // require storing the target article user ID on UserLikeArticle as a cache and indexing by it.
      // Definitely doable.
      {
        attributes: {
          include: [
            [
              sequelize.fn(
                'count',
                sequelize.col('articles->likes.articleId')
              ),
              'scoreDelta'
            ],
          ],
        },
        group: ['User.id'],
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
      }
    )

    if (user === null) {
      res.clearCookie(AUTH_COOKIE_NAME)
    } else {
      user.scoreDelta = Number(user.get('scoreDelta'))
    }
    return user
  }
}
