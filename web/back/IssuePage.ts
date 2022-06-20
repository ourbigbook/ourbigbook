import { getLoggedInUser } from 'back'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsIssueHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug, number: numberString }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const number = parseInt(numberString, 10)
      if (isNaN(number)) {
        return {
          notFound: true
        }
      }
      const [issue, loggedInUser] = await Promise.all([
        sequelize.models.Issue.getIssue({ includeComments: true, number, sequelize, slug: slug.join('/') }),
        getLoggedInUser(req, res),
      ])
      if (!issue) {
        return {
          notFound: true
        }
      }
      const [articleJson, comments, commentsCount, issueJson, loggedInUserJson] = await Promise.all([
        issue.issues.toJson(loggedInUser),
        Promise.all(issue.comments.map(comment => comment.toJson(loggedInUser))),
        sequelize.models.Comment.count({ where: { issueId: issue.id } }),
        issue.toJson(loggedInUser),
        loggedInUser.toJson(),
      ])
      return {
        props: {
          article: issueJson,
          comments,
          commentsCount,
          issueArticle: articleJson,
          loggedInUser: loggedInUserJson,
        }
      };
    } else {
      throw new TypeError
    }
  }
}
