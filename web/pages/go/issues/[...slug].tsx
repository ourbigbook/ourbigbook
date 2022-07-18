import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ defaultItemType: 'issue' });
import { getServerSidePropsIssueIndexHoc } from 'back/IssueIndexPage'
export const getServerSideProps = getServerSidePropsIssueIndexHoc()
