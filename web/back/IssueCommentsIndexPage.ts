import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsIssueCommentsIndexHoc = (): MyGetServerSideProps => {
  return async ({ params = {}, query, req, res }) => {
    const { slug } = params
    const sequelize = req.sequelize
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
    const [articleJson, [commentsCount, comments]] = await Promise.all([
      article.toJson(loggedInUser),
      sequelize.models.Comment.getComments({
        articleId: article.id,
        offset,
        order: [[order, ascDesc]],
        limit: articleLimit,
      }).then(commentsAndCounts => {
        return Promise.all([
          commentsAndCounts.count,
          Promise.all(commentsAndCounts.rows.map(comment => comment.toJson(loggedInUser))),
        ])
      })
    ])
    const props: IndexPageProps = {
      comments: comments,
      commentsCount: commentsCount,
      itemType: 'comment',
      issueArticle: articleJson,
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
