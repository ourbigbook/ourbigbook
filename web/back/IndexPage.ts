import { GetServerSideProps } from 'next'
import { verify } from 'jsonwebtoken'

import sequelize from 'db'
import { defaultLimit, fallback, secret } from 'front/config'
import { getCookieFromReq } from 'front'

export const getStaticPathsHome = () => {
  return {
    fallback,
    paths: [],
  }
}

function getLoggedInUser(req) {
  const authCookie = getCookieFromReq(req, 'auth')
  if (authCookie) {
    return verify(authCookie, secret)
  } else {
    return null
  }
}

export const makeGetServerSidePropsIndex = (what): GetServerSideProps => {
  return async ({ req }) => {
    const loggedInUser = getLoggedInUser(req)
    const page = req?.params?.page ? parseInt(req.params.page as string, 10) - 1: 0
    let order
    let empty = false
    switch (what) {
      case 'latest':
        order = 'createdAt'
      break;
      case 'top':
        order = 'score'
        break;
      case 'latest-followed':
      case 'top-followed':
        empty = true
        break;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    let articles
    let articlesCount
    if (empty) {
      articles = []
      articlesCount = 0
    } else {
      const articlesAndCount = await sequelize.models.Article.getArticles({
        sequelize,
        limit: defaultLimit,
        offset: page * defaultLimit,
        order,
      })
      articles = await Promise.all(articlesAndCount.rows.map(article => article.toJson()))
      articlesCount = articlesAndCount.count
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
