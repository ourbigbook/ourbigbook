import ArticleSourcePageHoc from 'front/ArticleSourcePage'
import { getServerSidePropsArticleSourceHoc } from 'back/ArticleSourcePage'
export const getServerSideProps = getServerSidePropsArticleSourceHoc();
export default ArticleSourcePageHoc();
