import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsIndexHoc = (what): MyGetServerSideProps => {
  return async ({ params = {}, req, res }) => {
    const { page } = params
    if (
      ( typeof page === 'undefined' || typeof page === 'string' )
    ) {
      const loggedInUser = await getLoggedInUser(req, res)
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
        break;
        case 'top':
          order = 'score'
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
      const offset = pageNum * articleLimit
      if (loggedInQuery) {
        const articlesAndCounts = await loggedInUser.findAndCountArticlesByFollowedToJson(
          offset, articleLimit, order)
        articles = articlesAndCounts.articles
        articlesCount = articlesAndCounts.articlesCount
      } else {
        const articlesAndCounts = await req.sequelize.models.Article.findAndCountAll({
          offset,
          order: [[order, 'DESC']],
          limit: articleLimit,
          include: [{
            model: req.sequelize.models.File,
            as: 'file',
            include: [{
              model: req.sequelize.models.User,
              as: 'author',
            }],
          }],
        })
        articles = await Promise.all(articlesAndCounts.rows.map(
          (article) => {return article.toJson(loggedInUser) }))
        articlesCount = articlesAndCounts.count
      }
      const props: IndexPageProps = {
        articles,
        articlesCount,
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
