import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import { ArticleSourcePageProps } from 'front/ArticleSourcePage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsArticleSourceHoc = (
  {}
={}): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const [article, loggedInUser] = await Promise.all([
        sequelize.models.Article.getArticle({
          sequelize,
          slug: slugString,
        }),
        getLoggedInUser(req, res),
      ])
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
