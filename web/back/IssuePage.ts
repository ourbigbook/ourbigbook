import { getLoggedInUser } from 'back'
import { MyGetServerSideProps } from 'front/types'
import { ArticlePageProps } from 'front/ArticlePage'
import { CommentType } from 'front/types/CommentType'

export const getServerSidePropsIssueHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug, number: numberString }, req, res }) => {
    if (slug instanceof Array) {
      const sequelize = req.sequelize
      const number = parseInt(numberString as string, 10)
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
        loggedInUser ? loggedInUser.toJson() : undefined,
      ])
      const props: ArticlePageProps = {
        article: issueJson,
        comments: comments as CommentType[],
        commentsCount,
        issueArticle: articleJson,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
