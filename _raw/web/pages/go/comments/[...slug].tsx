import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ pageType: 'articleComments' });
import { getServerSidePropsIssueCommentsIndexHoc } from 'back/IssueCommentsIndexPage'
export const getServerSideProps = getServerSidePropsIssueCommentsIndexHoc()
