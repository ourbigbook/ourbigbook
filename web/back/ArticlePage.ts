import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsArticleHoc = (includeIssues?, loggedInUserCache?): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const [article, loggedInUser] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues,
          limit: 5,
          sequelize,
          slug: slug.join('/'),
        }),
        getLoggedInUser(req, res, loggedInUserCache),
      ])
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
      if (includeIssues) {
        props.issues = await Promise.all(article.issues.map(comment => comment.toJson()))
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
