import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrderAndPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsUsers: MyGetServerSideProps = async (
  { query, req, res }
) => {
  const loggedInUser = await getLoggedInUser(req, res)
  const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
    defaultOrder: 'score',
    allowedSorts: {
      'created': 'createdAt',
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
    Comment.count(),
    // totalDiscussions
    Issue.count(),
    // totalTopics
    Topic.count(),
    // totalUsers
    User.count(),
    // users
    User.findAndCountAll({
      offset,
      order: [[order, ascDesc]],
      limit: articleLimit,
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
    itemType: 'user',
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
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson()
  }
  return { props }
}
