import { findSynonymOr404, getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage } from 'front/js'
import routes from 'front/routes'

export const getServerSidePropsArticleIssuesHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug } = {}, query, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const { Article, Issue, User } = sequelize.models
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
      const [articleJson, [issuesCount, issues]] = await Promise.all([
        article.toJson(loggedInUser),
        Issue.findAndCountAll({
          where: { articleId: article.id },
          offset,
          order: [[order, ascDesc]],
          limit: articleLimit,
          include: [{
            model: User,
            as: 'author',
          }],
        }).then(issuesAndCounts => {
          return Promise.all([
            issuesAndCounts.count,
            Promise.all(issuesAndCounts.rows.map(issue => issue.toJson(loggedInUser))),
          ])
        })
      ])
      const props: IndexPageProps = {
        articles: issues,
        articlesCount: issuesCount,
        itemType: 'discussion',
        issueArticle: articleJson,
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
