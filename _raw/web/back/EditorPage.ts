import ourbigbook, { titleToId } from 'ourbigbook'

import { getLoggedInUser } from 'back'
import routes from 'front/routes'
import { EditorPageProps } from 'front/EditorPage'
import { MyGetServerSideProps } from 'front/types'
import { uidTopicIdToSlug } from 'front/js'
import { ArticleType } from 'front/types/ArticleType'

function getTitleSourceOrBailOnCustomId(article: ArticleType): string {
  const titleSource = article.file.titleSource
  const topicId = article.topicId
  if (titleToId(titleSource) === topicId) {
    return titleSource
  } else {
    return topicId
  }
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
        parentTopicId
          ? sequelize.models.Article.getArticle({
              sequelize,
              slug: uidTopicIdToSlug(loggedInUser.username, parentTopicId),
            })
          : null
        ,
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
          props.parentTitle = article.parentId.toplevelId.titleSource
        }
        if (article.previousSiblingId) {
          props.previousSiblingTitle = article.previousSiblingId.toplevelId.titleSource
        }
      }
      if (previousSiblingTopicId) {
        props.previousSiblingTitle = getTitleSourceOrBailOnCustomId(previousSiblingArticle)
        props.parentTitle = getTitleSourceOrBailOnCustomId(previousSiblingArticle.parentArticle)
      } else {
        if (parentTopicId) {
          props.parentTitle = getTitleSourceOrBailOnCustomId(parentArticle)
        }
      }
      if (title) {
        props.titleSource = title || ""
      }
      return { props };
    }
  }
}
