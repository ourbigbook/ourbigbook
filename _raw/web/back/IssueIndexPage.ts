import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsIssueIndexHoc = (): MyGetServerSideProps => {
  return async ({ params = {}, query, req, res }) => {
    const { slug } = params
    const sequelize = req.sequelize
    const [order, pageNum, err] = getOrderAndPage(req, query.page)
    const [article, loggedInUser] = await Promise.all([
      sequelize.models.Article.getArticle({
        /** TODO implement issue fetch like this instead one day. */
        //includeIssues: false,
        //limitIssues: articleLimit,
        //orderIssues: order,
        //offsetIssues: offset,
        sequelize,
        slug: (slug as string[]).join('/'),
      }),
      getLoggedInUser(req, res),
    ])
    if (!article) { return { notFound: true } }
    if (err) { res.statusCode = 422 }
    const offset = pageNum * articleLimit
    const [articleJson, [issuesCount, issues]] = await Promise.all([
      article.toJson(loggedInUser),
      sequelize.models.Issue.findAndCountAll({
        where: { articleId: article.id },
        offset,
        order: [[order, 'DESC']],
        limit: articleLimit,
        include: [{
          model: sequelize.models.User,
          as: 'author',
        }],
      }).then(issuesAndCounts => {
        return Promise.all([
          issuesAndCounts.count,
          Promise.all(issuesAndCounts.rows.map(issue => issue.toJson(loggedInUser))),
        ])
      })
    ])
    const props: IndexPageProps = {
      articles: issues,
      articlesCount: issuesCount,
      itemType: 'discussion',
      issueArticle: articleJson,
      page: pageNum,
      order,
    }
    if (loggedInUser) {
      props.loggedInUser = await loggedInUser.toJson()
    }
    return { props }
  }
}
