import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ showUsers: true });
import { getServerSidePropsUsers } from 'back/UsersPage'
export const getServerSideProps = getServerSidePropsUsers
