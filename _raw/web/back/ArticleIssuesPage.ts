import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsArticleIssuesHoc = (): MyGetServerSideProps => {
  return async ({ params = {}, query, req, res }) => {
    const { slug } = params
    const sequelize = req.sequelize
    const { Article, Issue, User } = sequelize.models
    const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
      allowedSortsExtra: Issue.ALLOWED_SORTS_EXTRA,
    })
    const [article, loggedInUser] = await Promise.all([
      Article.getArticle({
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
    const offset = page * articleLimit
    const [articleJson, [issuesCount, issues]] = await Promise.all([
      article.toJson(loggedInUser),
      Issue.findAndCountAll({
        where: { articleId: article.id },
        offset,
        order: [[order, ascDesc]],
        limit: articleLimit,
        include: [{
          model: User,
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
