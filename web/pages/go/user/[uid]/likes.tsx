import { getStaticPathsUser, makeGetStaticPropsUser } from 'back/UserPage'
import UserPage from 'components/UserPage'
export const getStaticPaths = getStaticPathsUser
export const getStaticProps = makeGetStaticPropsUser('likes')
export default UserPage
