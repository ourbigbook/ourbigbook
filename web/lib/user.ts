import { GetStaticProps, GetStaticPaths } from 'next'

import { fallback, revalidate } from 'config'
import sequelize from 'lib/db'
import { DEFAULT_LIMIT  } from 'lib/utils/constant'

export const getStaticPathsUser: GetStaticPaths = async () => {
  return {
    fallback,
    paths: [],
  }
}

export const makeGetStaticPropsUser = (what): GetStaticProps => {
  return async (context) => {
    const user = await sequelize.models.User.findOne({
      where: { username: context.params.uid },
    })
    if (!user) {
      return {
        notFound: true
      }
    }
    const page = context?.params?.page ? parseInt(context.params.page as string, 10) - 1: 0
    let order
    let author
    let likedBy
    switch (what) {
      case 'likes':
        order = 'createdAt'
        likedBy = context.params.uid
        break
      case 'user-articles-top':
        order = 'score'
        author = context.params.uid
        break
      case 'user-articles-latest':
        order = 'createdAt'
        author = context.params.uid
        break
      default:
        throw new Error(`Unknown search: ${what}`)
    }
    const [
      articles,
      userJson,
      authoredArticleCount,
      likedArticleCount
    ] = await Promise.all([
      sequelize.models.Article.getArticles({
        sequelize,
        limit: DEFAULT_LIMIT,
        offset: page * DEFAULT_LIMIT,
        order,
        author,
        likedBy,
      }),
      user.toJson(),
      user.countAuthoredArticles(),
      user.countLikes(),
    ])
    return {
      props: {
        articles: await Promise.all(articles.rows.map(article => article.toJson())),
        articlesCount: articles.count,
        user: userJson,
        authoredArticleCount,
        likedArticleCount,
        page,
        what,
      },
      revalidate,
    }
  }
}
