import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsArticleHoc = ({ includeIssues, loggedInUserCache }={}): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const [article, articleTopIssues, loggedInUser] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues,
          limit: 5,
          sequelize,
          slug: slug.join('/'),
        }),
        sequelize.models.Article.getArticle({
          includeIssues,
          includeIssuesOrder: 'score',
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
      const [articleJson, issuesCount, topicArticleCount] = await Promise.all([
        article.toJson(loggedInUser),
        includeIssues ? sequelize.models.Issue.count({ where: { articleId: article.id } }) : null,
        sequelize.models.Article.count({
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
          loggedInUser.toJson(loggedInUser),
          sequelize.models.Article.findOne({ where: { slug } })
        ])
        if (loggedInUserVersionArticle) {
          props.sameArticleByLoggedInUser = slug
        }
      }
      if (includeIssues) {
        props.latestIssues = await Promise.all(article.issues.map(issue => issue.toJson(loggedInUser)))
        props.topIssues = await Promise.all(articleTopIssues.issues.map(issue => issue.toJson(loggedInUser)))
        props.issuesCount = issuesCount
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
