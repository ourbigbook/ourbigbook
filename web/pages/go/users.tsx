import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ isHomepage: true });
import { getServerSidePropsUsers } from 'back/UsersPage'
export const getServerSideProps = getServerSidePropsUsers
