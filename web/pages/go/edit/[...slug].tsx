import ArticleEditorPageHoc from 'front/ArticleEditorPage'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc();
export default ArticleEditorPageHoc();
