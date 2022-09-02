import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import routes from 'front/routes'
import { EditorPageProps } from 'front/EditorPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsEditorHoc = ({ isIssue=false }={}): MyGetServerSideProps => {
  return async ({ params, query, req, res }) => {
    const title = query.title
    const parentTitle = query['parent-title']
    const previousSiblingTitle = query['previous-sibling']
    if (
      title instanceof Array ||
      parentTitle instanceof Array ||
      previousSiblingTitle instanceof Array
    ) {
      throw new TypeError
    } else {
      const slug = params ? params.slug : undefined
      const slugString = slug instanceof Array ? slug.join('/') : undefined
      const number = params ? params.number ? Number(params.number) : undefined : undefined
      const sequelize = req.sequelize
      const existingIssue = isIssue && number
      const [
        article,
        issue,
        [loggedInUser, articleCountByLoggedInUser],
      ] = await Promise.all([
        slugString ? sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: slugString,
        }) : null,
        (existingIssue) ? sequelize.models.Issue.getIssue({
          sequelize,
          number,
          slug: slugString,
        }) : null,
        getLoggedInUser(req, res).then(loggedInUser => Promise.all([
          loggedInUser,
          loggedInUser
            ? isIssue
                ? sequelize.models.Issue.count({ where: { authorId: loggedInUser.id } })
                : sequelize.models.File.count({ where: { authorId: loggedInUser.id } })
            : null,
        ])),
      ])
      if (!loggedInUser) {
        return {
          redirect: {
            destination: routes.userNew(),
            permanent: false,
          }
        }
      }
      if (
        (slugString && !article) ||
        (isIssue && number && !issue)
      ) {
        return {
          notFound: true
        }
      }
      const [
        articleJson,
        issueArticleJson,
        loggedInUserJson,
        previousSiblingArticle,
      ] = await Promise.all([
        isIssue
          ? existingIssue ? issue.toJson(loggedInUser) : null
          : slugString ? article.toJson(loggedInUser) : null
        ,
        isIssue
          ? article.toJson(loggedInUser)
          : null
        ,
        loggedInUser.toJson(),
        previousSiblingTitle ? sequelize.models.Article.getArticle({
          includeParentAndPreviousSibling: true,
          sequelize,
          slug: `${loggedInUser.username}/${ourbigbook.titleToId(previousSiblingTitle)}`,
        }) : null,
      ])
      const props: EditorPageProps = {
        article: articleJson,
        articleCountByLoggedInUser,
        loggedInUser: loggedInUserJson,
      }
      if (isIssue) {
        props.issueArticle = issueArticleJson
      } else if (article) {
        if (article.parentId) {
          props.parentTitle = article.parentId.toplevelId.titleSource
        }
        if (article.previousSiblingId) {
          props.previousSiblingTitle = article.previousSiblingId.toplevelId.titleSource
        }
      }
      if (previousSiblingTitle) {
        props.previousSiblingTitle = previousSiblingTitle
        props.parentTitle = previousSiblingArticle.parentId.toplevelId.titleSource
      } else {
        if (parentTitle) {
          props.parentTitle = parentTitle
        }
      }
      if (title) {
        props.titleSource = title || ""
      }
      return { props };
    }
  }
}
