import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ pageType: 'articleIssues' });
import { getServerSidePropsArticleIssuesHoc } from 'back/ArticleIssuesPage'
export const getServerSideProps = getServerSidePropsArticleIssuesHoc()
