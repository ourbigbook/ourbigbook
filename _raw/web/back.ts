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
    const user = await req.sequelize.models.User.findByPk(verifiedUser.id)
    if (user === null) {
      res.clearCookie(AUTH_COOKIE_NAME)
    }
    return user
  }
}
