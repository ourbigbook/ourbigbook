import ArticlePageHoc from 'front/ArticlePage'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc({ includeIssues: true });
export default ArticlePageHoc();
