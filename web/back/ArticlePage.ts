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
      const [article, articleTopIssues] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues,
          limit: 5,
          sequelize,
          slug: slugString,
        }),
        //// TODO benchmark the effect of this monstrous query on article pages.
        //// If very slow, we could move it to after page load.
        //// TODO don't run this on split pages? But it requires doing a separate query step, which
        //// would possibly slow things down more than this actual query?
        //sequelize.models.Article.getArticlesInSamePage({
        //  sequelize,
        //  slug: slugString,
        //  loggedInUser,
        //}),
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
      const [
        articleJson,
        articlesInSamePage,
        h1ArticlesInSamePage,
        issuesCount,
        topicArticleCount,
        latestIssues,
        topIssues
      ] = await Promise.all([
        article.toJson(loggedInUser),
        sequelize.models.Article.getArticlesInSamePage({
          article,
          loggedInUser,
          sequelize,
        }),
        sequelize.models.Article.getArticlesInSamePage({
          article,
          loggedInUser,
          h1: true,
          sequelize,
        }),
        includeIssues ? sequelize.models.Issue.count({ where: { articleId: article.id } }) : null,
        sequelize.models.Article.count({
          where: { topicId: article.topicId },
        }),
        includeIssues ? Promise.all(article.issues.map(issue => issue.toJson(loggedInUser))) : null,
        includeIssues ? Promise.all(articleTopIssues.issues.map(issue => issue.toJson(loggedInUser))) : null,
      ])
      const h1ArticleInSamePage = h1ArticlesInSamePage[0]
      if (
        // False for Index pages, I think because they have no associated topic.
        // Which is correct.
        h1ArticleInSamePage
      ) {
        articleJson.topicCount = h1ArticleInSamePage.topicCount
        articleJson.issueCount = h1ArticleInSamePage.issueCount
        articleJson.hasSameTopic = h1ArticleInSamePage.hasSameTopic
      }
      const props: ArticlePageProps = {
        article: articleJson,
        articlesInSamePage,
        topicArticleCount,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson(loggedInUser)
      }
      if (includeIssues) {
        props.latestIssues = latestIssues
        props.topIssues = topIssues
        props.issuesCount = issuesCount
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
