import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrder, getPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsIndexHoc = ({ followed=false }): MyGetServerSideProps => {
  return async ({ query, req, res }) => {
    let order, err
    ;[order, err] = getOrder(req)
    if (err) { res.statusCode = 422 }
    let pageNum
    ;[pageNum, err] = getPage(query.page)
    if (err) { res.statusCode = 422 }
    const loggedInUser = await getLoggedInUser(req, res)
    let loggedInQuery
    if (!loggedInUser) {
      followed = false;
    }
    let articles
    let articlesCount
    const offset = pageNum * articleLimit
    if (followed) {
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
      followed,
      order,
      page: pageNum,
      what: 'articles',
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
