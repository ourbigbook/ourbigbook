import { GetServerSideProps } from 'next'
import { verify } from 'jsonwebtoken'

import sequelize from 'db'
import { articleLimit, fallback, secret } from 'front/config'
import { getCookieFromReq } from 'front'

export const getStaticPathsHome = () => {
  return {
    fallback,
    paths: [],
  }
}

function useLoggedInUser(req) {
  const authCookie = getCookieFromReq(req, 'auth')
  if (authCookie) {
    return verify(authCookie, secret)
  } else {
    return null
  }
}

// TODO add type back, fails with:
// Type error: Property 'params' does not exist on type 'IncomingMessage & { cookies: NextApiRequestCookies; }'.
//
//export const makeGetServerSidePropsIndex = (what): GetServerSideProps => {
export const makeGetServerSidePropsIndex = (what) => {
  return async ({ req }) => {
    const loggedInUser = useLoggedInUser(req)
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
    let user
    if (loggedInUser) {
      user = await sequelize.models.User.findByPk(loggedInUser.id)
    }
    if (loggedInQuery) {
      const articlesAndCounts = await user.findAndCountArticlesByFollowedToJson(0, articleLimit, order)
      articles = articlesAndCounts.articles
      articlesCount = articlesAndCounts.articlesCount
    } else {
      const articlesAndCounts = await sequelize.models.Article.findAndCountAll({
        order: [[order, 'DESC']],
        limit: articleLimit,
      })
      articles = await Promise.all(articlesAndCounts.rows.map(
        (article) => {return article.toJson(user) }))
      articlesCount = articlesAndCounts.count
    }
    return {
      props: {
        articles,
        articlesCount,
        loggedInUser,
        page,
        what,
      },
    }
  }
}
