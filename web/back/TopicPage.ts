import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit  } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { TopicPageProps } from 'front/TopicPage'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsTopicHoc = (): MyGetServerSideProps => {
  return async ({ params: { id }, query, req, res }) => {
    const [order, pageNum, err] = getOrderAndPage(req, query.page, { defaultOrder: 'score' })
    if (err) { res.statusCode = 422 }
    const loggedInUser = await getLoggedInUser(req, res)
    const sequelize = req.sequelize
    if (
      id instanceof Array
    ) {
      const topicId = id.join('/')
      const [articles, loggedInUserJson, topicJson] = await Promise.all([
        sequelize.models.Article.getArticles({
          sequelize,
          limit: articleLimit,
          offset: pageNum * articleLimit,
          order,
          topicId,
        }),
        loggedInUser ? loggedInUser.toJson(loggedInUser) : null,
        sequelize.models.Topic.getTopics({
          count: false,
          sequelize,
          articleWhere: { topicId },
        }).then(topics => {
          if (topics.length) {
            return topics[0].toJson(loggedInUser)
          } else {
            return null;
          }
        }),
        //sequelize.models.Topic.findOne({
        //  include: [{
        //    model: sequelize.models.Article,
        //    as: 'article',
        //    where: { topicId },
        //    include: [{
        //      model: sequelize.models.File,
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
        articles: await Promise.all(articles.rows.map(article => article.toJson(loggedInUser))),
        articlesCount: articles.count,
        topic: topicJson,
        order,
        page: pageNum,
        what: 'articles',
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
