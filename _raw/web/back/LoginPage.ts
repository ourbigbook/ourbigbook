import { getLoggedInUser } from 'back'
import { LoginPageProps } from 'front/LoginPage'

export async function getServerSidePropsLoginPage(context) {
  const { req, res } = context
  const loggedInUser = await getLoggedInUser(req, res)
  const props: LoginPageProps = {}
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser?.toJson(loggedInUser)
  }
  return { props }
}
