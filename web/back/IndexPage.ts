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
      allowedSortsExtra?: any;
    } = {}
    const sequelize = req.sequelize
    const { Article, Issue, Topic } = sequelize.models
    switch (itemTypeEff) {
      case 'article':
        getOrderAndPageOpts.allowedSortsExtra = Article.ALLOWED_SORTS_EXTRA
        break
      case 'comment':
        break
      case 'discussion':
        getOrderAndPageOpts.allowedSortsExtra = Issue.ALLOWED_SORTS_EXTRA
        break
      case 'topic':
        getOrderAndPageOpts.defaultOrder = Topic.DEFAULT_SORT
        getOrderAndPageOpts.allowedSortsExtra = Topic.ALLOWED_SORTS_EXTRA
        break
    }
    const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, getOrderAndPageOpts)
    if (err) { res.statusCode = 422 }
    const offset = page * articleLimit
    const limit = articleLimit
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
                offset, limit, order, ascDesc)
              articles = articlesAndCounts.articles
              articlesCount = articlesAndCounts.articlesCount
            } else {
              articlesAndCounts = await Article.getArticles({
                limit,
                list: true,
                offset,
                order,
                orderAscDesc: ascDesc,
                topicIdSearch: query.search,
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
              orderAscDesc: ascDesc,
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
              limit,
              offset,
              order,
              orderAscDesc: ascDesc,
              topicIdSearch: query.search,
              sequelize,
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
          model: Article,
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
      orderAscDesc: ascDesc,
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
