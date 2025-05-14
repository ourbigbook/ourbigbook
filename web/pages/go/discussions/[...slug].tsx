import IndexPageHoc from 'front/IndexPage'
export default IndexPageHoc({ pageType: 'articleDiscussions' });
import { getServerSidePropsArticleIssuesHoc } from 'back/ArticleIssuesPage'
export const getServerSideProps = getServerSidePropsArticleIssuesHoc()
