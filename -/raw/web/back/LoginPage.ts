import { getLoggedInUser } from 'back'
import { getClientIp } from 'front/js'
import { isIpBlockedForSignup } from 'back/webpack_safe'
import { LoginPageProps } from 'front/LoginPage'

export function getServerSidePropsLoginPageHoc({ register=false }={}) {
  return async ({ req, res }) => {
    const sequelize = req.sequelize
    const ip = getClientIp(req)
    const [loggedInUser, ipBlockPrefix] = await Promise.all([
      getLoggedInUser(req, res),
      register ? isIpBlockedForSignup(sequelize, ip) : undefined,
    ])
    const props: LoginPageProps = {
      ip,
      ipBlockPrefix: ipBlockPrefix === undefined ? null : ipBlockPrefix.ip,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser?.toJson(loggedInUser)
    }
    return { props }
  }
}
