import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from "lib/db";

const article = require('./articlejs')

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
      article: await article.getArticleJson(sequelize, pid)
    }
  };
}
