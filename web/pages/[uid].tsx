import { makeGetServerSidePropsUser } from 'back/UserPage'
import UserPage from 'front/UserPage'
export const getServerSideProps = makeGetServerSidePropsUser('home')
export default UserPage
