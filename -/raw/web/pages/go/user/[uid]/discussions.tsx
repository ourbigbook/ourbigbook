import { getServerSidePropsUserHoc } from 'back/UserPage'
import UserPage from 'front/UserPage'
export const getServerSideProps = getServerSidePropsUserHoc('user-issues')
export default UserPage
