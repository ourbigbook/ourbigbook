import { getLoggedInUser } from 'back'
import { articleLimit  } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { TopicPageProps } from 'front/TopicPage'
import {
  getOrderAndPage,
  getList,
} from 'front/js'

export const getServerSidePropsTopicHoc = (): MyGetServerSideProps => {
  return async ({ params: { id }, query, req, res }) => {
    const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
      allowedSortsExtra: { 'score': undefined },
      defaultOrder: 'score'
    })
    const list = getList(req, res)
    if (err) { res.statusCode = 422 }
    const loggedInUser = await getLoggedInUser(req, res)
    const sequelize = req.sequelize
    const { Article, Topic } = sequelize.models
    if (
      id instanceof Array
    ) {
      const topicId = id.join('/')
      const getArticlesOpts = {
        limit: articleLimit,
        list,
        offset: page * articleLimit,
        order,
        orderAscDesc: ascDesc,
        sequelize,
        topicId,
      }
      const [
        articleInTopicByLoggedInUser,
        articles,
        loggedInUserJson,
        topicJson,
        unlistedArticles,
      ] = await Promise.all([
        // articleInTopicByLoggedInUser
        Article.getArticleJsonInTopicBy(loggedInUser, topicId),
        // articles
        Article.getArticles(getArticlesOpts),
        // loggedInUserJson
        loggedInUser ? loggedInUser.toJson(loggedInUser) : null,
        // topicJson
        Topic.getTopics({
          articleWhere: { topicId },
          count: false,
          sequelize,
        }).then(topics => {
          if (topics.length) {
            return topics[0].toJson(loggedInUser)
          } else {
            return null;
          }
        }),
        // unlistedArticles
        Article.getArticles(Object.assign({}, getArticlesOpts, { list: false, rows: false })),
        //Topic.findOne({
        //  include: [{
        //    model: Article,
        //    as: 'article',
        //    where: { topicId },
        //    include: [{
        //      model: File,
        //      as: 'file',
        //    }]
        //  }]
        //}).then(topic => {
        //  if (topic) {
        //    return topic.toJson(loggedInUser)
        //  }
        //}),
      ])
      const props: TopicPageProps = {
        articleInTopicByLoggedInUser,
        articles: await Promise.all(articles.rows.map(article => article.toJson(loggedInUser))),
        articlesCount: articles.count,
        hasUnlisted: !!unlistedArticles.count,
        list: list === undefined ? null : list,
        topic: topicJson,
        order,
        orderAscDesc: ascDesc,
        page,
        what: 'articles',
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
