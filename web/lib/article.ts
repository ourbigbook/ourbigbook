import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from "lib/db";

export const getStaticPathsArticle: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: (await sequelize.models.Article.findAll()).map(
      article => {
        return {
          params: {
            pid: article.slug,
          }
        }
      }
    ),
  }
}

export const getStaticPropsArticle: GetStaticProps = async ({ params: { pid } }) => {
  const article = await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
  const articleJson = article.toJSONFor(article.Author);
  return { props: { article: articleJson } };
}
