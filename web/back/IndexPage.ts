import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrderAndPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsIndexHoc = ({
  followed=false,
  itemType,
}={}): MyGetServerSideProps => {
  return async ({ query, req, res }) => {
    const loggedInUser = await getLoggedInUser(req, res)
    if (!loggedInUser) {
      followed = false;
    }
    if (itemType === undefined) {
      if (loggedInUser) {
        itemType = 'article'
      } else {
        itemType = 'topic'
      }
    }
    const getOrderAndPageOpts = {}
    if (itemType === 'topics') {
      getOrderAndPageOpts.defaultOrder = 'score'
    }
    const [order, pageNum, err] = getOrderAndPage(req, query.page, getOrderAndPageOpts)
    if (err) { res.statusCode = 422 }

    let articles
    let articlesCount
    const offset = pageNum * articleLimit
    const limit = articleLimit
    const sequelize = req.sequelize
    switch (itemType) {
      case 'article':
        if (followed) {
          const articlesAndCounts = await loggedInUser.findAndCountArticlesByFollowedToJson(
            offset, limit, order)
          articles = articlesAndCounts.articles
          articlesCount = articlesAndCounts.articlesCount
        } else {
          const articlesAndCounts = await sequelize.models.Article.getArticles({
            sequelize,
            offset,
            order,
            limit,
          })
          articles = await Promise.all(articlesAndCounts.rows.map(
            (article) => {return article.toJson(loggedInUser) }))
          articlesCount = articlesAndCounts.count
        }
        break
      case 'topic':
          const articlesAndCounts = await sequelize.models.Topic.getTopics({
            sequelize,
            offset,
            order,
            limit,
          })
          articles = await Promise.all(articlesAndCounts.rows.map(
            (article) => {return article.toJson(loggedInUser) }))
          articlesCount = articlesAndCounts.count
        break
      default:
        throw new Error(`unknown itemType: ${itemType}`)
    }
    const props: IndexPageProps = {
      articles,
      articlesCount,
      followed,
      itemType,
      order,
      page: pageNum,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
