// Server-only code

import { GetStaticProps, GetStaticPaths } from 'next'

import { fallback, revalidate } from 'front/config'
import sequelize from 'db'
import { defaultLimit  } from 'front/config'

export const getStaticPathsTopic: GetStaticPaths = async () => {
  return {
    fallback,
    paths: [],
  }
}

export const makeGetStaticPropsTopic = (what): GetStaticProps => {
  return async (context) => {

    const page = context?.params?.page ? parseInt(context.params.page as string, 10) - 1: 0
    let order
    switch (what) {
      // TODO
      //case 'followed-latest':
      //  return `${apiPath}/articles/feed?limit=${defaultLimit}&offset=${
      //    page * defaultLimit
      //  }`;
      //case 'followed-top':
      //  return `${apiPath}/articles/feed?limit=${defaultLimit}&offset=${
      //    page * defaultLimit
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
      //  return `${apiPath}/articles?limit=${defaultLimit}&offset=${page * defaultLimit}&topicId=${props.topicId}&sort=score`;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    const articles = await sequelize.models.Article.getArticles({
      sequelize,
      limit: defaultLimit,
      offset: page * defaultLimit,
      order,
      topicId: context.params.id,
    })
    return {
      props: {
        articles: await Promise.all(articles.rows.map(article => article.toJson())),
        articlesCount: articles.count,
        page,
        what,
      },
      revalidate,
    }
  }
}
