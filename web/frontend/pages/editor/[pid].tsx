import makeArticleEditor from "../../components/editor/ArticleEditor";

// Backend.
import sequelize from "../../lib/db";

export async function getStaticProps({ params: { pid } }) {
  const article = await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
  const articleJson = article.toJSONFor(article.Author);
  return { props: { article: articleJson } };
};

export async function getStaticPaths() {
  const ret = { fallback: true };
  ret.paths = (await sequelize.models.Article.findAll()).map(
    article => {
      return {
        params: {
          pid: article.slug,
        }
      }
    }
  )
  return ret;
}

export default makeArticleEditor();
