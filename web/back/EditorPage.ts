import ourbigbook, { titleToId } from 'ourbigbook'

import { getLoggedInUser } from 'back'
import routes from 'front/routes'
import { EditorPageProps } from 'front/EditorPage'
import { MyGetServerSideProps } from 'front/types'
import { idToTopic, uidTopicIdToSlug } from 'front/js'
import { ArticleType } from 'front/types/ArticleType'

function getTitleSourceOrBailOnCustomIdFromArticle(article: ArticleType): string {
  const titleSource = article.file.titleSource
  const topicId = article.topicId
  if (titleToId(titleSource) === topicId) {
    return titleSource
  } else {
    return topicId
  }
}

function getTitleSourceOrBailOnCustomIdFromId(id: any): string {
  const topicId = idToTopic(id.idid)
  const titleSource = id.toplevelId.titleSource
  const topicSplit = topicId.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
  const idScope = topicSplit.slice(0, -1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
  const idBasename = topicSplit[topicSplit.length - 1]
  let ret
  if (titleToId(titleSource) === idBasename) {
    ret = titleSource
  } else {
    ret = idBasename
  }
  if (idScope) {
    ret = idScope + ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + ret
  }
  return ret
}

export const getServerSidePropsEditorHoc = ({ isIssue=false }={}): MyGetServerSideProps => {
  return async ({ params, query, req, res }) => {
    const title = query.title
    const parentTopicId = query['parent']
    const previousSiblingTopicId = query['previous-sibling']
    if (
      title instanceof Array ||
      parentTopicId instanceof Array ||
      previousSiblingTopicId instanceof Array
    ) {
      return { notFound: true }
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
        parentArticle,
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
        // parentArticle
        parentTopicId
          ? sequelize.models.Article.getArticle({
              sequelize,
              slug: uidTopicIdToSlug(loggedInUser.username, parentTopicId),
            })
          : null
        ,
        // previousSiblingArticle
        previousSiblingTopicId
          ? sequelize.models.Article.getArticle({
              includeParentAndPreviousSibling: true,
              sequelize,
              slug: uidTopicIdToSlug(loggedInUser.username, previousSiblingTopicId),
            })
          : null
        ,
      ])
      if (parentTopicId && !parentArticle) {
        return {
          notFound: true
        }
      }
      if (previousSiblingTopicId && !previousSiblingArticle) {
        return {
          notFound: true
        }
      }
      const props: EditorPageProps = {
        article: articleJson,
        articleCountByLoggedInUser,
        loggedInUser: loggedInUserJson,
      }
      if (isIssue) {
        props.issueArticle = issueArticleJson
      } else if (article) {
        if (article.parentId) {
          props.parentTitle = getTitleSourceOrBailOnCustomIdFromId(article.parentId)
        }
        if (article.previousSiblingId) {
          props.previousSiblingTitle = getTitleSourceOrBailOnCustomIdFromId(article.previousSiblingId)
        }
      }
      if (previousSiblingTopicId) {
        props.previousSiblingTitle = getTitleSourceOrBailOnCustomIdFromArticle(previousSiblingArticle)
        props.parentTitle = getTitleSourceOrBailOnCustomIdFromArticle(previousSiblingArticle.parentArticle)
      } else {
        if (parentTopicId) {
          props.parentTitle = getTitleSourceOrBailOnCustomIdFromArticle(parentArticle)
        }
      }
      if (title) {
        props.titleSource = title || ""
      }
      return { props };
    }
  }
}
