import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc(true);
import { getServerSidePropsIssueIndexHoc } from 'back/IssueIndexPage'
export const getServerSideProps = getServerSidePropsIssueIndexHoc('latest')
