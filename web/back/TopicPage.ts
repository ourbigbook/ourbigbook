// Server-only code

import { GetStaticProps, GetStaticPaths } from 'next'

import { fallback, revalidate } from 'front/config'
import sequelize from 'db'
import { DEFAULT_LIMIT  } from 'constant'

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
      //  return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
      //    page * DEFAULT_LIMIT
      //  }`;
      //case 'followed-top':
      //  return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
      //    page * DEFAULT_LIMIT
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
      //  return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&offset=${page * DEFAULT_LIMIT}&topicId=${props.topicId}&sort=score`;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    const articles = await sequelize.models.Article.getArticles({
      sequelize,
      limit: DEFAULT_LIMIT,
      offset: page * DEFAULT_LIMIT,
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
