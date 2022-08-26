import { GetServerSideProps } from 'next'

import { getLoggedInUser } from 'back'
import { articleLimit, fallback } from 'front/config'
import { IndexPageProps } from 'front/IndexPage'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage } from 'front/js'

export const getServerSidePropsIssueIndexHoc = (): MyGetServerSideProps => {
  return async ({ params = {}, query, req, res }) => {
    const { slug } = params
    const sequelize = req.sequelize
    const [article, loggedInUser] = await Promise.all([
      sequelize.models.Article.getArticle({
        includeIssues: true,
        limit: 5,
        sequelize,
        slug: (slug as string[]).join('/'),
      }),
      getLoggedInUser(req, res),
    ])
    if (!article) { return { notFound: true } }
    const [order, pageNum, err] = getOrderAndPage(req, query.page)
    if (err) { res.statusCode = 422 }
    let issues
    const offset = pageNum * articleLimit
    let issuesAndCounts, articleJson
    issuesAndCounts = await sequelize.models.Issue.findAndCountAll({
      where: { articleId: article.id },
      offset,
      order: [[order, 'DESC']],
      limit: articleLimit,
      include: [{
        model: sequelize.models.User,
        as: 'author',
      }],
    })
    ;[articleJson, issues] = await Promise.all([
      article.toJson(loggedInUser),
      Promise.all(issuesAndCounts.rows.map(
        (issue) => {return issue.toJson(loggedInUser) })),
    ])
    const props: IndexPageProps = {
      articles: issues,
      articlesCount: issuesAndCounts.count,
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
