import { getLoggedInUser } from 'back'
import { MyGetServerSideProps } from 'front/types'
import { typecastInteger } from 'front/js'
import { ArticlePageProps } from 'front/ArticlePage'
import { CommentType } from 'front/types/CommentType'

export const getServerSidePropsIssueHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug, number: numberString }, req, res }) => {
    if (
      slug instanceof Array &&
      typeof numberString === 'string'
    ) {
      const sequelize = req.sequelize
      typecastInteger
      const [number, ok] = typecastInteger(numberString)
      if (!ok) { return { notFound: true } }
      const [issue, loggedInUser] = await Promise.all([
        sequelize.models.Issue.getIssue({ includeComments: true, number, sequelize, slug: slug.join('/') }),
        getLoggedInUser(req, res),
      ])
      if (!issue) { return { notFound: true } }
      const [
        articleJson,
        commentCountByLoggedInUser,
        comments,
        commentsCount,
        issueJson,
        issuesCount,
        loggedInUserJson,
      ] = await Promise.all([
        issue.article.toJson(loggedInUser),
        loggedInUser ? sequelize.models.Comment.count({ where: { authorId: loggedInUser.id } }) : null,
        Promise.all(issue.comments.map(comment => comment.toJson(loggedInUser))),
        sequelize.models.Comment.count({ where: { issueId: issue.id } }),
        issue.toJson(loggedInUser),
        sequelize.models.Issue.count({ where: { articleId: issue.articleId } }),
        loggedInUser ? loggedInUser.toJson() : undefined,
      ])
      const props: ArticlePageProps = {
        article: issueJson,
        comments: comments as CommentType[],
        commentsCount,
        issueArticle: articleJson,
        issuesCount,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
        props.commentCountByLoggedInUser = commentCountByLoggedInUser
      }
      return { props }
    } else {
      throw new TypeError
    }
  }
}
