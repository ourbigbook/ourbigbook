import { getCookieFromReq } from 'front'
import sequelize from 'db'
import { verify } from 'jsonwebtoken'
import { secret } from 'front/config'

export async function getLoggedInUser(req, loggedInUser?) {
  if (loggedInUser !== undefined) {
    return loggedInUser
  } else {
    const authCookie = getCookieFromReq(req, 'auth')
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
    return await sequelize.models.User.findByPk(verifiedUser.id)
  }
}
