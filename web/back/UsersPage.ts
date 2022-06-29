import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { getOrder, getPage } from 'front/js'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsUsers = async ({ params = {}, req, res }) => {
  if (
    ( typeof page === 'undefined' || typeof page === 'string' )
  ) {
    const loggedInUser = await getLoggedInUser(req, res)
    let order, err
    ;[order, err] = getOrder(req)
    if (err) { return res.status(422).json(err) }
    let pageNum
    ;[pageNum, err] = getPage(req)
    if (err) { return res.status(422).json(err) }
    const offset = pageNum * articleLimit
    const { count: usersCount, rows: userRows } = await req.sequelize.models.User.findAndCountAll({
      offset,
      order: [[order, 'DESC']],
      limit: articleLimit,
    })
    let what
    if (order === 'createdAt') {
      what = 'users-latest'
    } else {
      what = 'users-top'
    }
    const users = await Promise.all(userRows.map(
      (user) => {return user.toJson(loggedInUser) }))
    const props: IndexPageProps = {
      users,
      usersCount,
      page: pageNum,
      what,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  } else {
    throw new TypeError
  }
}
