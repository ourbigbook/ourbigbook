import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc();
import { getServerSidePropsUsers } from 'back/UsersPage'
export const getServerSideProps = getServerSidePropsUsers
