import { GetStaticProps } from 'next'
import sequelize from 'db'
import { fallback, revalidate } from 'config'
import { DEFAULT_LIMIT  } from 'constant'

export const getStaticPathsHome = () => {
  return {
    fallback,
    paths: [],
  }
}

export const makeGetStaticPropsHome = (what): GetStaticProps => {
  return async (context) => {
    const page = context?.params?.page ? parseInt(context.params.page as string, 10) - 1: 0
    let order
    let empty = false
    switch (what) {
      case 'latest':
        order = 'createdAt'
      break;
      case 'top':
        order = 'score'
        break;
      case 'latest-followed':
      case 'top-followed':
        empty = true
        break;
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    let articles
    let articlesCount
    if (empty) {
      articles = []
      articlesCount = 0
    } else {
      const articlesAndCount = await sequelize.models.Article.getArticles({
        sequelize,
        limit: DEFAULT_LIMIT,
        offset: page * DEFAULT_LIMIT,
        order,
      })
      articles = await Promise.all(articlesAndCount.rows.map(article => article.toJson()))
      articlesCount = articlesAndCount.count
    }
    return {
      props: {
        articles,
        articlesCount,
        page,
        what,
      },
      revalidate,
    }
  }
}
