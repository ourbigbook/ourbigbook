import ourbigbook from 'ourbigbook'

import { findSynonymOr404, getLoggedInUser } from 'back'
import { ArticleSourcePageProps } from 'front/ArticleSourcePage'
import { MyGetServerSideProps } from 'front/types'
import routes from 'front/routes'

export const getServerSidePropsArticleSourceHoc = (
  {}
={}): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const { Article } = sequelize.models
      const [article, loggedInUser] = await Promise.all([
        Article.getArticle({ sequelize, slug: slugString }),
        getLoggedInUser(req, res),
      ])
      if (!article) {
        return await findSynonymOr404(sequelize, slugString, routes.articleSource)
      }
      const [articleJson, loggedInUserJson] = await Promise.all([
        article.toJson(loggedInUser),
        loggedInUser ? loggedInUser.toJson(loggedInUser) : undefined,
      ])
      const props: ArticleSourcePageProps = {
        article: articleJson,
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      return {
        props
      }
    } else {
      return { notFound: true }
    }
  }
}
