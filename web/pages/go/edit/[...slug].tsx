import ArticleEditorPageHoc from 'front/ArticleEditorPage'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
import sequelize from 'db'
export const getServerSideProps = getServerSidePropsArticleHoc();
export default ArticleEditorPageHoc();
