import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ pageType: 'articleIssues' });
import { getServerSidePropsIssueIndexHoc } from 'back/IssueIndexPage'
export const getServerSideProps = getServerSidePropsIssueIndexHoc()
