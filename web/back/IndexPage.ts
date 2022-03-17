import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import sequelize from 'db'
import { articleLimit, fallback } from 'front/config'

// TODO add type back, fails with:
// Type error: Property 'params' does not exist on type 'IncomingMessage & { cookies: NextApiRequestCookies; }'.
//
//export const makeGetServerSidePropsIndex = (what): GetServerSideProps => {
export const makeGetServerSidePropsIndex = (what) => {
  return async ({ req }) => {
    const loggedInUser = await getLoggedInUser(req)
    const page = req?.params?.page ? parseInt(req.params.page as string, 10) - 1: 0
    let order
    let loggedInQuery
    if (!loggedInUser) {
      if (what === 'latest-followed') {
        what = 'latest'
      } else if (what === 'top-followed') {
        what = 'top'
      }
    }
    switch (what) {
      case 'latest':
        order = 'createdAt'
        loggedInQuery = false
      break;
      case 'top':
        order = 'score'
        loggedInQuery = false
        break;
      case 'latest-followed':
        order = 'createdAt'
        loggedInQuery = true
        break;
      case 'top-followed':
        order = 'score'
        loggedInQuery = true
        break;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    let articles
    let articlesCount
    if (loggedInQuery) {
      const articlesAndCounts = await loggedInUser.findAndCountArticlesByFollowedToJson(0, articleLimit, order)
      articles = articlesAndCounts.articles
      articlesCount = articlesAndCounts.articlesCount
    } else {
      const articlesAndCounts = await sequelize.models.Article.findAndCountAll({
        order: [[order, 'DESC']],
        limit: articleLimit,
      })
      articles = await Promise.all(articlesAndCounts.rows.map(
        (article) => {return article.toJson(loggedInUser) }))
      articlesCount = articlesAndCounts.count
    }
    const props = {
      articles,
      articlesCount,
      page,
      what,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
