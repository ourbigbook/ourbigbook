import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import sequelize from 'db'
import { articleLimit, fallback } from 'front/config'

// TODO add type back, fails with:
// Type error: Property 'params' does not exist on type 'IncomingMessage & { cookies: NextApiRequestCookies; }'.
//
//export const getServerSidePropsIndexHoc = (what): GetServerSideProps => {
export const getServerSidePropsIndexHoc = (what) => {
  return async ({ req, res }) => {
    const loggedInUser = await getLoggedInUser(req, res)
    const page = req?.params?.page ? parseInt(req.params.page as string, 10) - 1: 0
    let order
    let loggedInQuery
    let whatEffective = what
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
      case 'latest-followed':
        order = 'createdAt'
        loggedInQuery = true
        break;
      case 'top-followed':
        order = 'score'
        loggedInQuery = true
        break;
      default:
        throw new Error(`Unknown search: ${whatEffective}`)
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
    const props: any = {
      articles,
      articlesCount,
      page,
      what: whatEffective,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
