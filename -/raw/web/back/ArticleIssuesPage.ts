import { findSynonymOr404, getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getList, getOrderAndPage } from 'front/js'
import routes from 'front/routes'

export const getServerSidePropsArticleIssuesHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug } = {}, query, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const { Article, Issue } = sequelize.models
      const list = getList(req, res)
      const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
        allowedSortsExtra: Issue.ALLOWED_SORTS_EXTRA,
      })
      const [article, loggedInUser] = await Promise.all([
        Article.getArticle({
          /** TODO implement issue fetch like this instead one day. */
          //includeIssues: false,
          //limitIssues: articleLimit,
          //orderIssues: order,
          //offsetIssues: offset,
          sequelize,
          slug: slugString,
        }),
        getLoggedInUser(req, res),
      ])
      if (!article) {
        return await findSynonymOr404(sequelize, slugString, routes.articleIssues)
      }
      if (err) { res.statusCode = 422 }
      const offset = page * articleLimit
      const [articleJson, issuesAndCount, unlistedCount] = await Promise.all([
        article.toJson(loggedInUser),
        Issue.getIssues({
          articleId: article.id,
          includeArticle: true,
          list,
          offset,
          order,
          orderAscDesc: ascDesc,
          limit: articleLimit,
          sequelize,
        }),
        Issue.count({ where: { articleId: article.id, list: false } }),
      ])
      const issues = await Promise.all(issuesAndCount.rows.map(issue => issue.toJson(loggedInUser)))
      const props: IndexPageProps = {
        articles: issues,
        articlesCount: issuesAndCount.count,
        hasUnlisted: !!unlistedCount,
        itemType: 'discussion',
        issueArticle: articleJson,
        list: list === undefined ? null : list,
        page,
        order,
        orderAscDesc: ascDesc,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson()
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
