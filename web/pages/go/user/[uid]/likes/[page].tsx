import { makeGetServerSidePropsUser } from 'back/UserPage'
import UserPage from 'front/UserPage'
export const getServerSideProps = makeGetServerSidePropsUser('likes')
export default UserPage
