import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ isHomepage: true });
import { getServerSidePropsIndexHoc } from 'back/IndexPage'
export const getServerSideProps = getServerSidePropsIndexHoc({ itemType: 'article' })
