import ArticleEditorPageHoc from 'front/ArticleEditorPage'
export default ArticleEditorPageHoc({ isnew: true });
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc();
