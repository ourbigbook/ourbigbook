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
    const [order, page, err] = getOrderAndPage(req, query.page, getOrderAndPageOpts)
    if (err) { res.statusCode = 422 }
    const offset = page * articleLimit
    const limit = articleLimit
    const sequelize = req.sequelize
    const [
      [articles, articlesCount],
      commentsAndCount,
      pinnedArticle
    ] = await Promise.all([
      (async () => {
        let articles
        let articlesCount
        let articlesAndCounts
        switch (itemTypeEff) {
          case 'article':
            if (followedEff) {
              articlesAndCounts = await loggedInUser.findAndCountArticlesByFollowedToJson(
                offset, limit, order)
              articles = articlesAndCounts.articles
              articlesCount = articlesAndCounts.articlesCount
            } else {
              articlesAndCounts = await sequelize.models.Article.getArticles({
                limit,
                list: true,
                offset,
                order,
                sequelize,
              })
              articles = await Promise.all(articlesAndCounts.rows.map(
                (article) => {return article.toJson(loggedInUser) }))
              articlesCount = articlesAndCounts.count
            }
            break
          case 'comment':
            articles = null
            articlesCount = null
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
        return [articles, articlesCount]
      })(),
      itemType === 'comment'
        ? sequelize.models.Comment.getComments({ limit, offset })
        : {}
      ,
      sequelize.models.Site.findOne({ include:
        [{
          model: sequelize.models.Article,
          as: 'pinnedArticle',
        }]
      }).then(site => {
        const pinnedArticle = site.pinnedArticle
        if (pinnedArticle) {
          return pinnedArticle.toJson(loggedInUser)
        } else {
          return null
        }
      }),
    ])
    const props: IndexPageProps = {
      followed: followedEff,
      itemType: itemTypeEff,
      order,
      page,
      pinnedArticle,
    }
    if (itemType === 'comment') {
      props.comments = await Promise.all(commentsAndCount.rows.map(comment => comment.toJson(loggedInUser)))
      props.commentsCount = commentsAndCount.count
    } else {
      if (articles) {
        props.articles = articles
        props.articlesCount = articlesCount
      }
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
