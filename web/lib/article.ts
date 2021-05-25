import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from "./db";

//const article = require('./articlejs')

export async function getArticle(sequelize, pid) {
  return await sequelize.models.Article.findOne({
    where: { slug: pid },
  });
}

export async function getArticleWithAuthor(sequelize, pid) {
  return await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
}

export async function getArticleJson(sequelize, pid, uid?) {
  const promises = [
    getArticleWithAuthor(sequelize, pid)
  ];
  if (uid) {
    promises.push(sequelize.models.User.findByPk(uid))
  }
  const ret = await Promise.all(promises);
  let user;
  const article = ret[0]
  if (!article) {
    return null;
  }
  if (uid) {
    user = ret[1]
  }
  return article.toJSONFor(article.Author, user);
}

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
  return {
    props: {
      article: await getArticleJson(sequelize, pid)
    }
  };
}
