import ArticleEditorPageHoc from 'front/ArticleEditorPage'
export default ArticleEditorPageHoc({ isNew: true });
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
export const getServerSideProps = getServerSidePropsArticleHoc();
