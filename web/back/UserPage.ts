import { GetStaticProps } from 'next'

import cirodown from 'cirodown/dist/cirodown'
import sequelize from 'db'
import { articleLimit  } from 'front/config'
import { makeGetServerSidePropsArticle } from 'back/ArticlePage'
import { getLoggedInUser } from 'back'

export const makeGetServerSidePropsUser = (what): GetStaticProps => {
  return async ({ params, req }) => {
    const loggedInUser = await getLoggedInUser(req)
    const user = await sequelize.models.User.findOne({
      where: { username: params.uid },
    })
    if (!user) {
      return {
        notFound: true
      }
    }
    const page = params?.page ? parseInt(params.page as string, 10) - 1: 0
    let order
    let author
    let likedBy
    if (what !== 'home') {
      switch (what) {
        case 'likes':
          order = 'createdAt'
          likedBy = params.uid
          break
        case 'user-articles-top':
          order = 'score'
          author = params.uid
          break
        case 'user-articles-latest':
          order = 'createdAt'
          author = params.uid
          break
        default:
          throw new Error(`Unknown search: ${what}`)
      }
    }
    const articlesPromise = what === 'home' ? [] : sequelize.models.Article.getArticles({
      sequelize,
      limit: articleLimit,
      offset: page * articleLimit,
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
      user.toJson(loggedInUser),
      user.countAuthoredArticles(),
      user.countLikes(),
    ])
    const props:any = {
      user: userJson,
      authoredArticleCount,
      likedArticleCount,
      loggedInUser: await loggedInUser.toJson(),
      page,
      what,
    }
    if (what === 'home') {
      const articleProps = (await makeGetServerSidePropsArticle(true, loggedInUser)({
        params: { slug: [ params.uid ] } }))
      Object.assign(props, articleProps.props)
    } else {
      props.articles = await Promise.all(articles.rows.map(article => article.toJson(loggedInUser)))
      props.articlesCount = articles.count
    }
    return {
      props,
    }
  }
}
