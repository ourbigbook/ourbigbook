import makeArticleEditor from 'front/ArticleEditor'
import { getStaticPropsArticle } from 'back/ArticlePage'
import sequelize from 'db'
export const getServerSideProps = getStaticPropsArticle();
export default makeArticleEditor();
