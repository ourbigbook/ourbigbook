import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ isIssue: true });
import { getServerSidePropsIssueIndexHoc } from 'back/IssueIndexPage'
export const getServerSideProps = getServerSidePropsIssueIndexHoc('top')
