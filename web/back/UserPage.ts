import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
import { articleLimit  } from 'front/config'
import { getOrderAndPage } from 'front/js'
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
      const [order, pageNum, err] = getOrderAndPage(req, query.page)
      if (err) { res.statusCode = 422 }
      let author, articlesFollowedBy, likedBy, following, followedBy, itemType
      switch (what) {
        case 'following':
          following = uid
          itemType = 'user'
          break
        case 'followed':
          followedBy = uid
          itemType = 'user'
          break
        case 'home':
          itemType = null
          break
        case 'likes':
          likedBy = uid
          itemType = 'article'
          break
        case 'followed-articles':
          articlesFollowedBy = uid
          itemType = 'article'
          break
        case 'user-articles':
          author = uid
          itemType = 'article'
          break
        case 'user-issues':
          author = uid
          itemType = 'discussion'
          break
        default:
          throw new Error(`Unknown search: ${what}`)
      }
      const offset = pageNum * articleLimit
      const articlesPromise =
        itemType === 'article' ? sequelize.models.Article.getArticles({
          sequelize,
          limit: articleLimit,
          offset,
          order,
          author,
          likedBy,
          followedBy: articlesFollowedBy,
        }) :
        itemType === 'discussion' ? sequelize.models.Issue.getIssues({
          sequelize,
          limit: articleLimit,
          offset,
          order,
          author,
          includeArticle: true,
        }) :
        []
      const usersPromise = itemType === 'user' ? sequelize.models.User.getUsers({
        followedBy,
        following,
        limit: articleLimit,
        offset,
        order,
        sequelize,
      }) : []
      const [
        articles,
        userJson,
        authoredArticleCount,
        users,
      ] = await Promise.all([
        articlesPromise,
        user.toJson(loggedInUser),
        user.countAuthoredArticles(),
        usersPromise,
      ])
      const props: UserPageProps = {
        authoredArticleCount,
        itemType,
        order,
        page: pageNum,
        user: userJson,
        what,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson()
      }
      if (itemType === 'user') {
        props.users = await Promise.all(users.rows.map(user => user.toJson(loggedInUser)))
        props.usersCount = users.count
      } else if (itemType === 'article' || itemType === 'discussion') {
        props.articles = await Promise.all(articles.rows.map(article => article.toJson(loggedInUser)))
        props.articlesCount = articles.count
      } else {
        const articleContext = Object.assign({}, context, { params: { slug: [ uid ] } })
        const articleProps = await (getServerSidePropsArticleHoc({
          includeIssues: true, loggedInUserCache: loggedInUser
        })(articleContext))
        if ('props' in articleProps) {
          Object.assign(props, articleProps.props)
        }
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
