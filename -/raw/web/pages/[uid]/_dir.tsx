import UserPage from 'front/UserPage'
import { getServerSidePropsUserHoc } from 'back/UserPage'
export const getServerSideProps = getServerSidePropsUserHoc('user-files-tree')
export default UserPage
