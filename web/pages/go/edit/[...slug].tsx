import makeArticleEditor from 'front/ArticleEditor'
import { makeGetServerSidePropsArticle } from 'back/ArticlePage'
import sequelize from 'db'
export const getServerSideProps = makeGetServerSidePropsArticle();
export default makeArticleEditor();
