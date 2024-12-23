import { getLoggedInUser } from 'back'
import { articleLimit } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { getOrderAndPage, typecastInteger } from 'front/js'
import { ArticlePageProps } from 'front/ArticlePage'
import { CommentType } from 'front/types/CommentType'

export const getServerSidePropsIssueHoc = (): MyGetServerSideProps => {
  return async ({ params: { slug, number: numberString }, query, req, res }) => {
    if (
      slug instanceof Array &&
      typeof numberString === 'string'
    ) {
      const sequelize = req.sequelize
      const { Comment, Issue } = sequelize.models
      typecastInteger
      const [number, ok] = typecastInteger(numberString)
      if (!ok) { return { notFound: true } }
      const { ascDesc, err, order, page } = getOrderAndPage(req, query.page, {
        allowedSortsExtra: Comment.ALLOWED_SORTS_EXTRA,
      })
      const offset = page * articleLimit
      const [issue, loggedInUser] = await Promise.all([
        Issue.getIssue({
          // TODO implement and use these options one day.
          //includeComments: true,
          //commentOrder: order,
          //offset,
          //limit: articleLimit,

          number,
          sequelize,
          slug: slug.join('/'),
        }),
        getLoggedInUser(req, res),
      ])
      if (err) { res.statusCode = 422 }
      if (!issue) { return { notFound: true } }
      const [
        articleJson,
        commentCountByLoggedInUser,
        [ comments, commentsCount, ],
        issueJson,
        issuesCount,
        loggedInUserJson,
      ] = await Promise.all([
        issue.article.toJson(loggedInUser),
        loggedInUser ? Comment.count({ where: { authorId: loggedInUser.id } }) : null,
        Comment.getComments({
          issueId: issue.id,
          order: [[order, 'ASC']],
          limit: articleLimit,
          offset,
        }).then(commentsAndCount =>
          Promise.all([
            Promise.all(commentsAndCount.rows.map(comment => comment.toJson(loggedInUser))),
            commentsAndCount.count,
          ])
        ),
        issue.toJson(loggedInUser),
        Issue.count({ where: { articleId: issue.articleId } }),
        loggedInUser ? loggedInUser.toJson() : undefined,
      ])
      const props: ArticlePageProps = {
        article: issueJson,
        comments: comments as CommentType[],
        commentsCount,
        page,
        issueArticle: articleJson,
        issuesCount,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
        props.commentCountByLoggedInUser = commentCountByLoggedInUser
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
