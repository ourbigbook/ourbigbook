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
        case 'liked':
          author = uid
          itemType = 'like'
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
      const likesPromise = itemType === 'like' ? sequelize.models.UserLikeArticle.findAndCountAll({
          include: [
            {
              model: sequelize.models.Article,
              as: 'article',
              include: [{
                model: sequelize.models.File,
                as: 'file',
                include: [{
                  model: sequelize.models.User,
                  as: 'author',
                  where: { id: user.id },
                }]
              }]
            },
            {
              model: sequelize.models.User,
              as: 'user',
            },
          ],
          order: [[order, 'DESC']],
          offset,
        }) : []
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
        likes,
        users,
      ] = await Promise.all([
        articlesPromise,
        user.toJson(loggedInUser),
        likesPromise,
        usersPromise,
      ])
      const props: UserPageProps = {
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
      } else if (itemType === 'like') {
        const articles = []
        for (const like of likes.rows) {
          const article = like.article
          article.likedBy = like.user
          article.likedByDate = like.createdAt
          articles.push(article)
        }
        props.articles = await Promise.all(articles.map(user => user.toJson(loggedInUser)))
        props.articlesCount = likes.count
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
