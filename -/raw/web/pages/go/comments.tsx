import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc();
import { getServerSidePropsIndexHoc } from 'back/IndexPage'
export const getServerSideProps = getServerSidePropsIndexHoc({ itemType: 'comment' })
