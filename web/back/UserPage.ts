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
      const [loggedInUser, user] = await Promise.all([
        getLoggedInUser(req, res),
        sequelize.models.User.findOne({
          where: { username: uid },
        }),
      ])
      if (!user) {
        return {
          notFound: true
        }
      }
      const [order, pageNum, err] = getOrderAndPage(req, query.page)
      if (err) { res.statusCode = 422 }
      let author, articlesFollowedBy, likedBy, following, followedBy, itemType
      switch (what) {
        case 'follows':
          followedBy = uid
          itemType = 'user'
          break
        case 'followed':
          following = uid
          itemType = 'user'
          break
        case 'home':
          itemType = null
          break
        case 'liked':
          author = uid
          itemType = 'like'
          break
        case 'liked-discussions':
          // TODO https://github.com/ourbigbook/ourbigbook/issues/313
          author = uid
          itemType = 'discussion-like'
          break
        case 'likes':
          likedBy = uid
          itemType = 'article'
          break
        case 'likes-discussions':
          likedBy = uid
          itemType = 'discussion'
          break
        case 'followed-articles':
          articlesFollowedBy = uid
          itemType = 'article'
          break
        case 'followed-discussions':
          articlesFollowedBy = uid
          itemType = 'discussion'
          break
        case 'user-articles':
          author = uid
          itemType = 'article'
          break
        case 'user-comments':
          author = uid
          itemType = 'comment'
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
          author,
          followedBy: articlesFollowedBy,
          likedBy,
          limit: articleLimit,
          list: true,
          offset,
          order,
          sequelize,
        }) :
        itemType === 'discussion' ? sequelize.models.Issue.getIssues({
          author,
          likedBy,
          followedBy: articlesFollowedBy,
          includeArticle: true,
          limit: articleLimit,
          offset,
          order,
          sequelize,
        }) :
        []
      const likesPromise =
        itemType === 'like' ? sequelize.models.User.findAndCountArticleLikesReceived(user.id, { offset, order }) :
        itemType === 'discussion-like' ? sequelize.models.User.findAndCountDiscussionLikesReceived(user.id, { offset, order }) :
        []
      const usersPromise = itemType === 'user' ? sequelize.models.User.getUsers({
        following,
        followedBy,
        limit: articleLimit,
        offset,
        order,
        sequelize,
      }) : []
      const updateNewScoreLastCheckPromise = (what === 'liked' && loggedInUser && user.id === loggedInUser.id) ?
        user.update({ newScoreLastCheck: Date.now() }) : null
      const [
        articles,
        comments,
        userJson,
        loggedInUserJson,
        likes,
        users,
      ] = await Promise.all([
        articlesPromise,
        itemType === 'comment'
          ? sequelize.models.Comment.getComments({ authorId: user.id, limit: articleLimit, offset })
          : {}
        ,
        user.toJson(loggedInUser),
        loggedInUser ? loggedInUser.toJson() : undefined,
        likesPromise,
        usersPromise,
        updateNewScoreLastCheckPromise,
      ])
      const props: UserPageProps = {
        itemType,
        order,
        page: pageNum,
        user: userJson,
        what,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      if (itemType === 'user') {
        props.users = await Promise.all(users.rows.map(user => user.toJson(loggedInUser)))
        props.usersCount = users.count
      } else if (itemType === 'article' || itemType === 'discussion') {
        props.articles = await Promise.all(articles.rows.map(article => article.toJson(loggedInUser)))
        props.articlesCount = articles.count
      } else if (itemType === 'like' || itemType === 'discussion-like') {
        const articles = []
        for (const like of likes.rows) {
          const article = like.article
          article.likedBy = like.user
          article.likedByDate = like.createdAt
          articles.push(article)
        }
        props.articles = await Promise.all(articles.map(article => article.toJson(loggedInUser)))
        props.articlesCount = likes.count
      } else if (itemType === 'comment') {
        props.comments = await Promise.all(comments.rows.map(comment => comment.toJson(loggedInUser)))
        props.commentsCount = comments.count
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
