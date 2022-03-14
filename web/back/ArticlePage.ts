import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from 'db';
import { fallback, revalidate } from 'config'

const cirodown = require('cirodown')

export const getStaticPathsArticle: GetStaticPaths = async () => {
  return {
    fallback,
    paths: [],
  }
}

export function getStaticPropsArticle(addRevalidate?, addComments?) {
  return async ({ params: { slug } }) => {
    const article = await sequelize.models.Article.findOne({
      where: { slug: slug.join('/') },
      include: [{ model: sequelize.models.User, as: 'author' }],
    })
    if (!article) {
      return {
        notFound: true
      }
    }
    const [articleJson, topicArticleCount] = await Promise.all([
      await article.toJson(),
      await sequelize.models.Article.count({
        where: { topicId: article.topicId },
      }),
    ])
    const ret: any = {
      props: {
        article: articleJson,
        topicArticleCount,
      },
    }
    if (addComments) {
      const comments = await article.getComments({
        order: [['createdAt', 'DESC']],
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
      ret.props.comments = await Promise.all(comments.map(comment => comment.toJson()))
    }
    if (addRevalidate) {
      ret.revalidate = revalidate
    }
    return ret;
  }
}
