import sequelize from 'db'
import { getLoggedInUser } from 'back'

export function makeGetServerSidePropsArticle(addComments?, loggedInUserCache?) {
  return async ({ params: { slug }, req }) => {
    const loggedInUser = await getLoggedInUser(req, loggedInUserCache)
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
      await article.toJson(loggedInUser),
      await sequelize.models.Article.count({
        where: { topicId: article.topicId },
      }),
    ])
    const ret: any = {
      props: {
        article: articleJson,
        loggedInUser: await loggedInUser.toJson(),
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
    return ret;
  }
}
