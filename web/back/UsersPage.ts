import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrder, getPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { UserType } from 'front/types/UserType'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsUsers: MyGetServerSideProps = async (
  { query, req, res }
) => {
  const loggedInUser = await getLoggedInUser(req, res)
  let order, err
  ;[order, err] = getOrder(req)
  if (err) { res.statusCode = 422 }
  let pageNum
  ;[pageNum, err] = getPage(query.page)
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
    order,
    users,
    usersCount,
    page: pageNum,
    what: 'users',
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson()
  }
  return { props }
}
