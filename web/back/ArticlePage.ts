import sequelize from 'db'
import { getLoggedInUser } from 'back'

export function getServerSidePropsArticleHoc(addComments?, loggedInUserCache?) {
  return async ({ params: { slug }, req, res }) => {
    const loggedInUser = await getLoggedInUser(req, res, loggedInUserCache)
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
    const props = {
      article: articleJson,
      topicArticleCount,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    const ret: any = { props }
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
