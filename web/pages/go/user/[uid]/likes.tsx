import { getStaticPathsUser, makeGetStaticPropsUser } from 'lib/user'
import UserPage from 'components/UserPage'
export const getStaticPaths = getStaticPathsUser
export const getStaticProps = makeGetStaticPropsUser('likes')
export default UserPage
