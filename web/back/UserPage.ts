import { GetStaticProps, GetStaticPaths } from 'next'

import cirodown from 'cirodown/dist/cirodown'
import { fallback, revalidate } from 'config'
import sequelize from 'db'
import { DEFAULT_LIMIT  } from 'constant'
import { getStaticPropsArticle } from 'back/ArticlePage'

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
    if (what !== 'home') {
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
    }
    const articlesPromise = what === 'home' ? [] : sequelize.models.Article.getArticles({
      sequelize,
      limit: DEFAULT_LIMIT,
      offset: page * DEFAULT_LIMIT,
      order,
      author,
      likedBy,
    })
    ;const [
      articles,
      userJson,
      authoredArticleCount,
      likedArticleCount
    ] = await Promise.all([
      articlesPromise,
      user.toJson(),
      user.countAuthoredArticles(),
      user.countLikes(),
    ])
    const props:any = {
      user: userJson,
      authoredArticleCount,
      likedArticleCount,
      page,
      what,
    }
    if (what === 'home') {
      const articleProps = (await getStaticPropsArticle(true, true)({
        params: { slug: [ context.params.uid ] } }))
      Object.assign(props, articleProps.props)
    } else {
      props.articles = await Promise.all(articles.rows.map(article => article.toJson()))
      props.articlesCount = articles.count
    }
    return {
      props,
      revalidate,
    }
  }
}
