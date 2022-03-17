import { makeGetServerSidePropsUser } from 'back/UserPage'
import UserPage from 'front/UserPage'
export const getServerSideProps = makeGetServerSidePropsUser('user-articles-top')
export default UserPage
