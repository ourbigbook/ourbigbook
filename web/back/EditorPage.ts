import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import routes from 'front/routes'
import { EditorPageProps } from 'front/ArticleEditorPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsEditorHoc = (): MyGetServerSideProps => {
  return async ({ params, query, req, res }) => {
    const title = query.title
    if (title instanceof Array) {
      throw new TypeError
    } else {
      const slug = params ? params.slug : undefined
      let slugString = slug instanceof Array ? slug.join('/') : undefined
      const sequelize = req.sequelize
      const [article, loggedInUser] = await Promise.all([
        slugString ? sequelize.models.Article.getArticle({
          sequelize,
          slug: slugString,
        }) : null,
        getLoggedInUser(req, res),
      ])
      if (!loggedInUser) {
        return {
          redirect: {
            destination: routes.userNew(),
            permanent: false,
          }
        }
      }
      if (slugString && !article) {
        return {
          notFound: true
        }
      }
      const [articleJson] = await Promise.all([
        slugString ? article.toJson(loggedInUser) : null,
      ])
      const props: EditorPageProps = {
        article: articleJson,
      }
      if (title) {
        props.titleSource = title || ""
      }
      return { props };
    }
  }
}
