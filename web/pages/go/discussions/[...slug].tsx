import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ defaultItemType: 'discussion' });
import { getServerSidePropsIssueIndexHoc } from 'back/IssueIndexPage'
export const getServerSideProps = getServerSidePropsIssueIndexHoc()
