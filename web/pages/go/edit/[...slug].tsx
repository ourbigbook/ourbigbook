import makeArticleEditor from 'components/ArticleEditor'
import { getStaticPropsArticle } from 'back/ArticlePage'
import sequelize from 'lib/db'
export const getServerSideProps = getStaticPropsArticle();
export default makeArticleEditor();
