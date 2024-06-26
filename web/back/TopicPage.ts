import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit  } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { TopicPageProps } from 'front/TopicPage'
import {
  getOrderAndPage,
  typecastBoolean,
} from 'front/js'

export const getServerSidePropsTopicHoc = (): MyGetServerSideProps => {
  return async ({ params: { id }, query, req, res }) => {
    const [order, pageNum, err] = getOrderAndPage(req, query.page, { defaultOrder: 'score' })
    let showUnlisted, ok
    ;[showUnlisted, ok] = typecastBoolean(query['show-unlisted'])
    if (!ok) {
      showUnlisted = false
    }
    if (err || !ok) { res.statusCode = 422 }
    const list = showUnlisted ? undefined : true
    const loggedInUser = await getLoggedInUser(req, res)
    const sequelize = req.sequelize
    if (
      id instanceof Array
    ) {
      const topicId = id.join('/')
      const getArticlesOpts = {
        sequelize,
        limit: articleLimit,
        list,
        offset: pageNum * articleLimit,
        order,
        topicId,
      }
      const [
        articles,
        loggedInUserJson,
        topicJson,
        unlistedArticles,
      ] = await Promise.all([
        sequelize.models.Article.getArticles(getArticlesOpts),
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
        sequelize.models.Article.getArticles(Object.assign({}, getArticlesOpts, { list: false })),
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
        hasUnlisted: !!unlistedArticles.count,
        list: list === undefined ? null : list,
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
