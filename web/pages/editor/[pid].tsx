import makeArticleEditor from "../../components/editor/ArticleEditor";

// Backend.
import sequelize from "lib/db";

export async function getServerSideProps({ params: { pid } }) {
  const article = await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
  const articleJson = article.toJSONFor(article.Author);
  return { props: { article: articleJson } };
};

export default makeArticleEditor();
