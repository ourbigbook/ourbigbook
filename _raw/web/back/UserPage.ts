import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
import { articleLimit  } from 'front/config'
import { getList, getOrderAndPage, idToSlug, uidTopicIdToId } from 'front/js'
import { MyGetServerSideProps } from 'front/types'
import { UserPageProps } from 'front/UserPage'

export const getServerSidePropsUserHoc = (what): MyGetServerSideProps => {
  return async (context) => {
    const { params: { uid, parentTopicId }, query, req, res } = context
    const parentTopicIdString = parentTopicId === undefined ? undefined : (
      // Not sure how this can be a string which is the reason for the cast.
      parentTopicId as string[]
    ).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
    if (
      typeof uid === 'string'
    ) {
      const sequelize = req.sequelize
      const { Article, Comment, Ref, Issue, User } = sequelize.models
      const [loggedInUser, user] = await Promise.all([
        getLoggedInUser(req, res),
        User.findOne({
          where: { username: uid },
        }),
      ])
      if (!user) {
        return {
          notFound: true
        }
      }
      const list = getList(req, res)
      let author, articlesFollowedBy, likedBy, following, followedBy, itemType
      let allowedSorts, allowedSortsExtra, defaultOrder, parentFromTo, parentId, parentType
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
        case 'user-child-articles':
          author = uid
          // TODO would be more efficient here with Ref.to_id_index.
          // But that requires generalizing the Article.getArticles interface a bit,
          // not in the mood right now.
          defaultOrder = 'nestedSetIndex',
          itemType = 'article'
          parentId = uidTopicIdToId(uid, parentTopicIdString)
          parentType = Ref.Types[ourbigbook.REFS_TABLE_PARENT]
          break
        case 'user-incoming-articles':
          author = uid
          defaultOrder = 'slug',
          itemType = 'article'
          parentId = uidTopicIdToId(uid, parentTopicIdString)
          parentFromTo = 'from'
          parentType = Ref.Types[ourbigbook.REFS_TABLE_X]
          break
        case 'user-tagged-articles':
          author = uid
          defaultOrder = 'slug',
          itemType = 'article'
          parentId = uidTopicIdToId(uid, parentTopicIdString)
          parentType = Ref.Types[ourbigbook.REFS_TABLE_X_CHILD]
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
      switch (what) {
        case 'user-articles':
          allowedSortsExtra = Article.ALLOWED_SORTS_EXTRA
          break
        case 'user-comments':
          allowedSortsExtra = Comment.ALLOWED_SORTS_EXTRA
          break
        case 'user-issues':
          allowedSortsExtra = Issue.ALLOWED_SORTS_EXTRA
          break
        default:
          allowedSorts = undefined
          // It is harder to do the rest efficiently as they would require indices across tables.
          allowedSortsExtra = {}
      }
      const getOrderAndPageOpts: any = { allowedSortsExtra }
      if (allowedSorts) {
        getOrderAndPageOpts.allowedSorts = allowedSorts
      }
      const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
        allowedSorts,
        allowedSortsExtra,
        defaultOrder,
      })
      if (err) { res.statusCode = 422 }
      const offset = page * articleLimit
      const getArticlesOpts = {
        author,
        followedBy: articlesFollowedBy,
        likedBy,
        limit: articleLimit,
        list,
        offset,
        order,
        orderAscDesc: ascDesc,
        parentFromTo,
        parentId,
        parentType,
        topicIdSearch: query.search,
        sequelize,
      }
      const articlesPromise =
        itemType === 'article' ? Article.getArticles(getArticlesOpts) :
        itemType === 'discussion' ? Issue.getIssues({
          author,
          likedBy,
          followedBy: articlesFollowedBy,
          includeArticle: true,
          limit: articleLimit,
          offset,
          order,
          orderAscDesc: ascDesc,
          sequelize,
        }) :
        []
      const likesPromise =
        itemType === 'like' ? User.findAndCountArticleLikesReceived(user.id, {
          offset, order, orderAscDesc: ascDesc }) :
        itemType === 'discussion-like' ? User.findAndCountDiscussionLikesReceived(user.id, {
          offset, order, orderAscDesc: ascDesc }) :
        []
      const usersPromise = itemType === 'user' ? User.getUsers({
        following,
        followedBy,
        limit: articleLimit,
        offset,
        order,
        orderAscDesc: ascDesc,
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
        unlistedArticles,
        parentArticle,
        users,
      ] = await Promise.all([
        // articles
        articlesPromise,
        // comments
        itemType === 'comment'
          ? Comment.getComments({ authorId: user.id, limit: articleLimit, offset })
          : {}
        ,
        // userJson
        user.toJson(loggedInUser),
        // loggedInUserJson
        loggedInUser ? loggedInUser.toJson() : undefined,
        // likes
        likesPromise,
        // unlistedArticles
        itemType === 'article'
          ? Article.getArticles(Object.assign({}, getArticlesOpts, { list: false, rows: false }))
          : {}
        ,
        // parentArticle
        (parentId !== undefined)
          ? Article.getArticle({ slug: idToSlug(parentId), sequelize })
          : null
        ,
        // users
        usersPromise,
        updateNewScoreLastCheckPromise,
      ])
      if (parentTopicIdString && !parentArticle) {
        return {
          notFound: true
        }
      }
      const props: UserPageProps = {
        clearScoreDelta: !!updateNewScoreLastCheckPromise,
        hasUnlisted: !!unlistedArticles.count,
        itemType,
        list: list === undefined ? null : list,
        order,
        orderAscDesc: ascDesc,
        page,
        user: userJson,
        what,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      if (parentArticle) {
        props.parentArticle = { 
          slug: parentArticle.slug,
          titleRender: parentArticle.titleRender,
        }
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
          includeIssues: true,
          loggedInUserCache: loggedInUser,
        })(articleContext))
        if ('props' in articleProps) {
          Object.assign(props, articleProps.props)
        }
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
