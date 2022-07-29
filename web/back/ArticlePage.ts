import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import { MyGetServerSideProps } from 'front/types'
import { UserType } from 'front/types/UserType'

export const getServerSidePropsArticleHoc = ({
  includeIssues=false,
  loggedInUserCache,
}:
  {
    includeIssues?: boolean,
    loggedInUserCache?: UserType,
  }
={}): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const loggedInUser = await getLoggedInUser(req, res, loggedInUserCache)
      const [article, articlesInSamePage, articleTopIssues] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues,
          limit: 5,
          sequelize,
          slug: slugString,
        }),
        // TODO benchmark the effect of this monstrous query on article pages.
        // If very slow, we could move it to after page load.
        // TODO don't run this on split pages? But it requires doing a separate query step, which
        // would possibly slow things down more than this actual query?
        sequelize.models.Article.getArticlesInSamePage({
          sequelize,
          slug: slugString,
          loggedInUser,
        }),
        sequelize.models.Article.getArticle({
          includeIssues,
          includeIssuesOrder: 'score',
          limit: 5,
          sequelize,
          slug: slugString,
        }),
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
        articlesInSamePage,
        topicArticleCount,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson(loggedInUser)
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
