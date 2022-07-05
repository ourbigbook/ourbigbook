import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getPage } from 'front/js'

export const getServerSidePropsIssueIndexHoc = (what): MyGetServerSideProps => {
  return async ({ params = {}, req, res }) => {
    const { slug, page } = params
    if (
      ( typeof page === 'undefined' || typeof page === 'string' )
    ) {
      const sequelize = req.sequelize
      const [article, loggedInUser] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues: true,
          limit: 5,
          sequelize,
          slug: (slug as string[]).join('/'),
          include: [{
            model: sequelize.models.File,
            as: 'file',
            include: [{
              model: sequelize.models.User,
              as: 'author',
            }],
          }],
        }),
        getLoggedInUser(req, res),
      ])
      if (!article) {
        return {
          notFound: true
        }
      }
      let order
      let loggedInQuery
      let whatEffective = what
      const [pageNum, err] = getPage(page)
      if (err) { res.statusCode = 422 }
      if (!loggedInUser) {
        if (what === 'latest-followed') {
          whatEffective = 'latest'
        } else if (what === 'top-followed') {
          whatEffective = 'top'
        }
      }
      switch (whatEffective) {
        case 'latest':
          order = 'createdAt'
          loggedInQuery = false
        break;
        case 'top':
          order = 'score'
          loggedInQuery = false
          break;
        //case 'latest-followed':
        //  order = 'createdAt'
        //  loggedInQuery = true
        //  break;
        //case 'top-followed':
        //  order = 'score'
        //  loggedInQuery = true
        //  break;
        default:
          throw new Error(`Unknown search: ${whatEffective}`)
      }
      let issues
      let issuesCount
      const offset = pageNum * articleLimit
      let issuesAndCounts, articleJson
      if (loggedInQuery) {
        //const issuesAndCounts = await loggedInUser.findAndCountIssuesByFollowedToJson(
        //  offset, articleLimit, order)
        //issues = issuesAndCounts.issues
        //issuesCount = issuesAndCounts.issuesCount
      } else {
        issuesAndCounts = await sequelize.models.Issue.findAndCountAll({
          where: { articleId: article.id },
          offset,
          order: [[order, 'DESC']],
          limit: articleLimit,
          include: [{
            model: sequelize.models.User,
            as: 'author',
          }],
        })
        ;[articleJson, issues] = await Promise.all([
          article.toJson(loggedInUser),
          Promise.all(issuesAndCounts.rows.map(
            (issue) => {return issue.toJson(loggedInUser) })),
        ])
      }
      const props: IndexPageProps = {
        articles: issues,
        articlesCount: issuesAndCounts.count,
        issueArticle: articleJson,
        page: pageNum,
        what: whatEffective,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson()
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
