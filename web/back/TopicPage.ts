import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit  } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { TopicPageProps } from 'front/TopicPage'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsTopicHoc = (): MyGetServerSideProps => {
  return async ({ params, query, req, res }) => {
    const [order, pageNum, err] = getOrderAndPage(req, query.page)
    if (err) { res.statusCode = 422 }
    const loggedInUser = await getLoggedInUser(req, res)
    const sequelize = req.sequelize
    const articles = await sequelize.models.Article.getArticles({
      sequelize,
      limit: articleLimit,
      offset: pageNum * articleLimit,
      order,
      topicId: params.id,
    })
    const props: TopicPageProps = {
      articles: await Promise.all(articles.rows.map(article => article.toJson(loggedInUser))),
      articlesCount: articles.count,
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
