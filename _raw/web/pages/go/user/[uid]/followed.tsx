import { getServerSidePropsUserHoc } from 'back/UserPage'
import UserPage from 'front/UserPage'
export const getServerSideProps = getServerSidePropsUserHoc('followed')
export default UserPage
