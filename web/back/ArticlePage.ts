import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsArticleHoc = (addComments?, loggedInUserCache?): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const loggedInUser = await getLoggedInUser(req, res, loggedInUserCache)
      const article = await sequelize.models.Article.findOne({
        where: { slug: slug.join('/') },
        include: [
          {
            model: sequelize.models.File,
            as: 'file',
            include: [{
              model: sequelize.models.User,
              as: 'author',
            }]
        }],
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
      const props: ArticlePageProps = {
        article: articleJson,
        topicArticleCount,
      }
      if (loggedInUser) {
        const slug = `${loggedInUser.username}/${article.topicId}`
        let loggedInUserVersionArticle
        ;[props.loggedInUser, loggedInUserVersionArticle] = await Promise.all([
          loggedInUser.toJson(),
          sequelize.models.Article.findOne({ where: { slug } })
        ])
        if (loggedInUserVersionArticle) {
          props.loggedInUserVersionSlug = slug
        }
      }
      if (addComments) {
        const comments = await article.getComments({
          order: [['createdAt', 'DESC']],
          include: [{ model: sequelize.models.User, as: 'author' }],
        })
        props.comments = await Promise.all(comments.map(comment => comment.toJson()))
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
