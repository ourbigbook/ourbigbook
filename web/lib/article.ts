import { GetStaticProps, GetStaticPaths } from 'next'
import sequelize from "lib/db";

export const getStaticPathsArticle: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: [],
  }
}

export function getStaticPropsArticle(revalidate?, addComments?) {
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
    let comments;
    if (addComments) {
      comments = await article.getComments({
        order: [['createdAt', 'DESC']],
        include: [{ model: sequelize.models.User, as: 'author' }],
      })
    }
    const ret: any = {
      props: { article: await article.toJson() },
    }
    if (revalidate !== undefined) {
      ret.revalidate = revalidate
    }
    if (addComments) {
      ret.props.comments = await Promise.all(comments.map(comment => comment.toJson()))
    }
    return ret;
  }
}
