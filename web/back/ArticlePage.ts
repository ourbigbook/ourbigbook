import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsArticleHoc = (addIssues?, loggedInUserCache?): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const loggedInUser = await getLoggedInUser(req, res, loggedInUserCache)
      const article = await sequelize.models.Article.getArticle({
        slug: slug.join('/'),
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
          props.sameArticleByLoggedInUser = slug
        }
      }
      if (addIssues) {
        const issues = await article.getIssues({
          order: [['createdAt', 'DESC']],
          include: [{ model: sequelize.models.User, as: 'author' }],
        })
        props.issues = await Promise.all(issues.map(issue => issue.toJson()))
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
