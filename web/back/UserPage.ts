import ourbigbook from 'ourbigbook/dist/ourbigbook'

import { getLoggedInUser } from 'back'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
import { articleLimit  } from 'front/config'
import { getOrder, getPage } from 'front/js'
import { MyGetServerSideProps } from 'front/types'
import { UserPageProps } from 'front/UserPage'

export const getServerSidePropsUserHoc = (what): MyGetServerSideProps => {
  return async (context) => {
    const { params: { uid }, query, req, res } = context
    if (
      typeof uid === 'string'
    ) {
      const sequelize = req.sequelize
      const loggedInUser = await getLoggedInUser(req, res)
      const user = await sequelize.models.User.findOne({
        where: { username: uid },
      })
      if (!user) {
        return {
          notFound: true
        }
      }
      let order, err
      ;[order, err] = getOrder(req)
      if (err) { res.statusCode = 422 }
      let pageNum
      ;[pageNum, err] = getPage(query.page)
      if (err) { res.statusCode = 422 }
      let author, likedBy
      if (what !== 'home') {
        switch (what) {
          case 'likes':
            likedBy = uid
            break
          case 'user-articles':
            author = uid
            break
          default:
            throw new Error(`Unknown search: ${what}`)
        }
      }
      const articlesPromise = what === 'home' ? [] : sequelize.models.Article.getArticles({
        sequelize,
        limit: articleLimit,
        offset: pageNum * articleLimit,
        order,
        author,
        likedBy,
      })
      ;const [
        articles,
        userJson,
        authoredArticleCount,
      ] = await Promise.all([
        articlesPromise,
        user.toJson(loggedInUser),
        user.countAuthoredArticles(),
      ])
      const props: UserPageProps = {
        authoredArticleCount,
        order,
        page: pageNum,
        user: userJson,
        what,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson()
      }
      if (what === 'home') {
        const articleContext = Object.assign({}, context, { params: { slug: [ uid ] } })
        const articleProps = await (getServerSidePropsArticleHoc({
          includeIssues: true, loggedInUserCache: loggedInUser })(articleContext))
        if ('props' in articleProps) {
          Object.assign(props, articleProps.props)
        }
      } else {
        props.articles = await Promise.all(articles.rows.map(article => article.toJson(loggedInUser)))
        props.articlesCount = articles.count
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
