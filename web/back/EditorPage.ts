import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import routes from 'front/routes'
import { EditorPageProps } from 'front/ArticleEditorPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsEditorHoc = ({ isIssue=false }={}): MyGetServerSideProps => {
  return async ({ params, query, req, res }) => {
    const title = query.title
    if (title instanceof Array) {
      throw new TypeError
    } else {
      const slug = params ? params.slug : undefined
      const slugString = slug instanceof Array ? slug.join('/') : undefined
      const number = params ? params.number ? Number(params.number) : undefined : undefined
      const sequelize = req.sequelize
      const [article, issue, [loggedInUser, articleCountByLoggedInUser]] = await Promise.all([
        slugString ? sequelize.models.Article.getArticle({
          sequelize,
          slug: slugString,
        }) : null,
        (isIssue && number) ? sequelize.models.Issue.getIssue({
          sequelize,
          number,
          slug: slugString,
        }) : null,
        getLoggedInUser(req, res).then(loggedInUser => Promise.all([
          loggedInUser,
          loggedInUser
            ? sequelize.models.Article.count({
                include: [{
                  model: sequelize.models.File,
                  as: 'file',
                  where: { authorId: loggedInUser.id },
                }]
              })
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
      const [articleJson, loggedInUserJson] = await Promise.all([
        slugString ? article.toJson(loggedInUser) : null,
        loggedInUser.toJson(),
      ])
      const props: EditorPageProps = {
        article: articleJson,
        articleCountByLoggedInUser,
        loggedInUser: loggedInUserJson,
      }
      if (title) {
        props.titleSource = title || ""
      }
      return { props };
    }
  }
}
