import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ showUsers: true });
import { getServerSidePropsIndexHoc } from 'back/IndexPage'
export const getServerSideProps = getServerSidePropsIndexHoc('top-followed')
