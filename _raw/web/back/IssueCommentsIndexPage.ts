import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getList, getOrderAndPage } from 'front/js'

export const getServerSidePropsIssueCommentsIndexHoc = (): MyGetServerSideProps => {
  return async ({ params = {}, query, req, res }) => {
    const { slug } = params
    const sequelize = req.sequelize
    const list = getList(req, res)
    const { ascDesc, err, order, page } = getOrderAndPage(req, query.page)
    if (err) { res.statusCode = 422 }
    const [article, loggedInUser] = await Promise.all([
      sequelize.models.Article.getArticle({
        /** TODO implement comment fetch like this instead one day. */
        //includeComments: false,
        //limitComments: articleLimit,
        //orderComments: order,
        //offsetComments: offset,
        sequelize,
        slug: (slug as string[]).join('/'),
      }),
      getLoggedInUser(req, res),
    ])
    if (!article) { return { notFound: true } }
    const offset = page * articleLimit
    const [articleJson, commentsAndCount, unlistedCount] = await Promise.all([
      article.toJson(loggedInUser),
      sequelize.models.Comment.getComments({
        articleId: article.id,
        list,
        offset,
        order: [[order, ascDesc]],
        limit: articleLimit,
      }),
      sequelize.models.Comment.count({
        where: { list: false },
        include: [{
          model: sequelize.models.Issue,
          as: 'issue',
          required: true,
          where: { articleId: article.id },
        }],
      }),
    ])
    const comments = await Promise.all(commentsAndCount.rows.map(comment => comment.toJson(loggedInUser)))
    const props: IndexPageProps = {
      comments: comments,
      commentsCount: commentsAndCount.count,
      hasUnlisted: !!unlistedCount,
      itemType: 'comment',
      issueArticle: articleJson,
      list: list === undefined ? null : list,
      page,
      order,
      orderAscDesc: ascDesc,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
