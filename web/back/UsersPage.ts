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
  const [{ count: usersCount, rows: userRows }, site] = await Promise.all([
    await sequelize.models.User.findAndCountAll({
      offset,
      order: [[order, ascDesc]],
      limit: articleLimit,
    }),
    sequelize.models.Site.findOne({ include:
      [{
        model: sequelize.models.Article,
        as: 'pinnedArticle',
      }]
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
    users,
    usersCount,
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson()
  }
  return { props }
}
