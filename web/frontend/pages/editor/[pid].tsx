import makeArticleEditor from "../../components/editor/ArticleEditor";

// Backend.
const { Article, User } = require("cirodown-backend/models");

export async function getStaticProps({ params: { pid } }) {
  const article = await Article.findOne({
    where: { slug: pid },
    include: [{ model: User, as: 'Author' }],
  });
  const articleJson = article.toJSONFor(article.Author);
  return { props: { article: articleJson } };
};

export async function getStaticPaths() {
  const ret = { fallback: true };
  debugger;
  ret.paths = (await Article.findAll()).map(
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
