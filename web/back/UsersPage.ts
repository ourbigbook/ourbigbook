import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrderAndPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { UserType } from 'front/types/UserType'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsUsers: MyGetServerSideProps = async (
  { query, req, res }
) => {
  const loggedInUser = await getLoggedInUser(req, res)
  const [order, pageNum, err] = getOrderAndPage(req, query.page, { defaultOrder: 'score' })
  if (err) { res.statusCode = 422 }
  const offset = pageNum * articleLimit
  const { count: usersCount, rows: userRows } = await req.sequelize.models.User.findAndCountAll({
    offset,
    order: [[order, 'DESC']],
    limit: articleLimit,
  })
  const users: UserType[] = await Promise.all(userRows.map(
    (user) => { return user.toJson(loggedInUser) }))
  const props: IndexPageProps = {
    itemType: 'user',
    order,
    page: pageNum,
    users,
    usersCount,
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson()
  }
  return { props }
}
