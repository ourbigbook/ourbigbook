import ArticlePage from 'front/ArticlePage'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc();
export default ArticlePage;
