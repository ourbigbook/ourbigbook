import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrderAndPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsIndexHoc = ({
  followed=false,
  itemType=undefined,
}={}): MyGetServerSideProps => {
  return async ({ query, req, res }) => {
    const loggedInUser = await getLoggedInUser(req, res)
    let followedEff = followed
    if (!loggedInUser) {
      followedEff = false;
    }
    let itemTypeEff = itemType
    if (itemTypeEff === undefined) {
      if (loggedInUser) {
        itemTypeEff = 'article'
      } else {
        itemTypeEff = 'topic'
      }
    }
    const getOrderAndPageOpts: {
      defaultOrder?: string;
      urlToDbSort?: any;
    } = {}
    if (itemTypeEff === 'topic') {
      getOrderAndPageOpts.defaultOrder = 'articleCount'
      getOrderAndPageOpts.urlToDbSort = {
        'article-count': 'articleCount'
      }
    }
    const [order, pageNum, err] = getOrderAndPage(req, query.page, getOrderAndPageOpts)
    if (err) { res.statusCode = 422 }
    let articles
    let articlesCount
    let articlesAndCounts
    const offset = pageNum * articleLimit
    const limit = articleLimit
    const sequelize = req.sequelize
    switch (itemTypeEff) {
      case 'article':
        if (followedEff) {
          articlesAndCounts = await loggedInUser.findAndCountArticlesByFollowedToJson(
            offset, limit, order)
          articles = articlesAndCounts.articles
          articlesCount = articlesAndCounts.articlesCount
        } else {
          articlesAndCounts = await sequelize.models.Article.getArticles({
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
      case 'discussion':
          articlesAndCounts = await sequelize.models.Issue.getIssues({
            sequelize,
            includeArticle: true,
            offset,
            order,
            limit,
          })
          articles = await Promise.all(articlesAndCounts.rows.map(
            (article) => {
              return article.toJson(loggedInUser)
            }))
          articlesCount = articlesAndCounts.count
        break
      case 'topic':
          articlesAndCounts = await sequelize.models.Topic.getTopics({
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
        throw new Error(`unknown itemType: ${itemTypeEff}`)
    }
    const props: IndexPageProps = {
      articles,
      articlesCount,
      followed: followedEff,
      itemType: itemTypeEff,
      order,
      page: pageNum,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
