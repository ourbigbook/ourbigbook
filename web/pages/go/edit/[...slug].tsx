import makeArticleEditorPage from 'front/ArticleEditorPage'
import { makeGetServerSidePropsArticle } from 'back/ArticlePage'
import sequelize from 'db'
export const getServerSideProps = makeGetServerSidePropsArticle();
export default makeArticleEditorPage();
