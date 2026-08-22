import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getLocked, getOrderAndPage, getVerified } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsUsers: MyGetServerSideProps = async (
  { query, req, res }
) => {
  const loggedInUser = await getLoggedInUser(req, res)
  const locked = getLocked(req, res)
  const verified = getVerified(req, res)
  const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
    defaultOrder: 'score',
    allowedSorts: {
      'created': 'createdAt',
      'comments': 'commentCount',
      'discussions': 'discussionCount',
      'follower-count': 'followerCount',
      'score': undefined,
      'username': undefined,
    }
  })
  const sequelize = req.sequelize
  if (err) { res.statusCode = 422 }
  const offset = page * articleLimit
  const { Article, Comment, Issue, Site, Topic, User } = sequelize.models
  const [
    site,
    totalArticles,
    totalComments,
    totalDiscussions,
    totalTopics,
    totalUsers,
    lockedUsers,
    unverifiedUsers,
    { count: usersCount, rows: userRows },
  ] = await Promise.all([
    // site
    Site.findOne({ include:
      [{
        model: Article,
        as: 'pinnedArticle',
      }]
    }),
    // totalArticles
    Article.count({ where: { list: true } }),
    // totalComments
    Comment.count({ where: { list: true } }),
    // totalDiscussions
    Issue.count({ where: { list: true } }),
    // totalTopics
    Topic.count(),
    // totalUsers
    User.count({ where: { locked: false, verified: true } }),
    // lockedUsers
    User.count({ where: { locked: true } }),
    // unverifiedUsers
    User.count({ where: { verified: false } }),
    // users
    User.getUsers({
      locked,
      offset,
      order,
      orderAscDesc: ascDesc,
      limit: articleLimit,
      sequelize,
      verified,
    }),
  ])
  const [users, pinnedArticle] = await Promise.all([
    Promise.all(userRows.map(
      (user) => { return user.toJson(loggedInUser) })),
    (async () => {
      const pinnedArticle = site.pinnedArticle
      if (pinnedArticle) {
        return pinnedArticle.toJson(loggedInUser)
      } else {
        return null
      }
    })(),
  ])
  const props: IndexPageProps = {
    hasLocked: !!lockedUsers,
    hasUnverified: !!unverifiedUsers,
    itemType: 'user',
    locked: locked === undefined ? null : locked,
    order,
    orderAscDesc: ascDesc,
    page,
    pinnedArticle,
    totalArticles,
    totalDiscussions,
    totalComments,
    totalTopics,
    totalUsers,
    users,
    usersCount,
    verified: verified === undefined ? null : verified,
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson()
  }
  return { props }
}
