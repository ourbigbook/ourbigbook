import ArticlePageHoc from 'front/ArticlePage'
import { getServerSidePropsIssueHoc } from 'back/IssuePage'
export const getServerSideProps = getServerSidePropsIssueHoc();
export default ArticlePageHoc(true);
