import UserPage from 'front/UserPage'
import { getServerSidePropsUserHoc } from 'back/UserPage'
export const getServerSideProps = getServerSidePropsUserHoc('user-files')
export default UserPage
