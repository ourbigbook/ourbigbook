import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit  } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { TopicPageProps } from 'front/TopicPage'

export const getServerSidePropsTopicHoc = (what): MyGetServerSideProps => {
  return async ({ params, req, res }) => {
    const loggedInUser = await getLoggedInUser(req, res)
    const page = params?.page ? parseInt(params.page as string, 10) - 1: 0
    let order
    switch (what) {
      // TODO
      //case 'followed-latest':
      //  return `${apiPath}/articles/feed?limit=${articleLimit}&offset=${
      //    page * articleLimit
      //  }`;
      //case 'followed-top':
      //  return `${apiPath}/articles/feed?limit=${articleLimit}&offset=${
      //    page * articleLimit
      //  }&sort=score`;
      case 'latest':
      case 'latest-followed':
        order = 'createdAt'
        break;
      case 'top':
      case 'top-followed':
        order = 'score'
        break;
      //case 'topic-articles':
      //case 'topic-users': // TODO top users for a topic.
      //  return `${apiPath}/articles?limit=${articleLimit}&offset=${page * articleLimit}&topicId=${props.topicId}&sort=score`;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    const sequelize = req.sequelize
    const articles = await sequelize.models.Article.getArticles({
      sequelize,
      limit: articleLimit,
      offset: page * articleLimit,
      order,
      topicId: params.id,
    })
    const props: TopicPageProps = {
      articles: await Promise.all(articles.rows.map(article => article.toJson(loggedInUser))),
      articlesCount: articles.count,
      page,
      what,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
