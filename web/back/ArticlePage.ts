import ourbigbook from 'ourbigbook'

import { getLoggedInUser } from 'back'
import { getConvertOpts } from 'convert'
import { ArticlePageProps } from 'front/ArticlePage'
import { maxArticlesFetch } from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { idToSlug } from 'front/js'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import routes from 'front/routes'

async function getIncomingLinks(sequelize, article, { type, from, to }) {
  return sequelize.models.Article.findAll({
    attributes: ['slug', 'titleRender'],
    order: [['slug', 'ASC']],
    include: [{
      model: sequelize.models.File,
      as: 'file',
      required: true,
      attributes: [],
      include: [{
        model: sequelize.models.Id,
        as: 'toplevelId',
        required: true,
        attributes: [],
        include: [{
          model: sequelize.models.Ref,
          as: from,
          required: true,
          where: { type: sequelize.models.Ref.Types[type] },
          attributes: [],
          include: [{
            model: sequelize.models.Id,
            as: to,
            required: true,
            attributes: [],
            include: [{
              model: sequelize.models.File,
              as: 'toplevelId',
              required: true,
              attributes: [],
              include: [{
                model: sequelize.models.Article,
                as: 'file',
                required: true,
                attributes: [],
                where: { slug: article.slug },
              }],
            }],
          }],
        }],
      }]
    }]
  })
}

export const getServerSidePropsArticleHoc = ({
  includeIssues=false,
  loggedInUserCache,
}:
  {
    includeIssues?: boolean,
    loggedInUserCache?: UserType,
  }
={}): MyGetServerSideProps => {
  return async ({ params: { slug }, req, res }) => {
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const loggedInUser = await getLoggedInUser(req, res, loggedInUserCache)
      const limit = 5;
      const [article, articleTopIssues] = await Promise.all([
        sequelize.models.Article.getArticle({
          includeIssues,
          limit,
          sequelize,
          slug: slugString,
        }),
        //// TODO benchmark the effect of this monstrous query on article pages.
        //// If very slow, we could move it to after page load.
        //// TODO don't run this on split pages? But it requires doing a separate query step, which
        //// would possibly slow things down more than this actual query?
        //sequelize.models.Article.getArticlesInSamePage({
        //  sequelize,
        //  slug: slugString,
        //  loggedInUser,
        //}),
        sequelize.models.Article.getArticle({
          includeIssues,
          includeIssuesOrder: 'score',
          limit,
          sequelize,
          slug: slugString,
        }),
      ])
      if (!article) {
        const redirects = await sequelize.models.Article.findRedirects([slugString], { limit: 1 })
        const newSlug = redirects[slugString]
        if (newSlug) {
          return {
            redirect: {
              destination: routes.article(newSlug),
              permanent: false,
            },
          }
        } else {
          return {
            notFound: true
          }
        }
      }
      const [
        ancestors,
        articleJson,
        articlesInSamePage,
        articlesInSamePageForToc,
        h1ArticlesInSamePage,
        incomingLinks,
        issuesCount,
        synonymIds,
        topicArticleCount,
        latestIssues,
        tagged,
        topIssues
      ] = await Promise.all([
        article.treeFindAncestors({ attributes: ['slug', 'titleRender'] }),
        article.toJson(loggedInUser),
        sequelize.models.Article.getArticlesInSamePage({
          article,
          loggedInUser,
          limit: maxArticlesFetch,
          sequelize,
        }),
        sequelize.models.Article.getArticlesInSamePage({
          article,
          loggedInUser,
          limit: maxArticlesFetch * 10,
          render: false,
          sequelize,
        }),
        sequelize.models.Article.getArticlesInSamePage({
          article,
          loggedInUser,
          h1: true,
          sequelize,
        }),
        getIncomingLinks(sequelize, article, { type: ourbigbook.REFS_TABLE_X, from: 'from', to: 'to' }),
        includeIssues ? sequelize.models.Issue.count({ where: { articleId: article.id } }) : null,
        sequelize.models.Id.findAll({
          include: [{
            model: sequelize.models.Ref,
            as: 'from',
            required: true,
            where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM] },
            attributes: [],
            include: [{
              model: sequelize.models.Id,
              as: 'to',
              required: true,
              attributes: [],
              include: [{
                model: sequelize.models.File,
                as: 'toplevelId',
                required: true,
                attributes: [],
                include: [{
                  model: sequelize.models.Article,
                  as: 'file',
                  required: true,
                  attributes: [],
                  where: { slug: article.slug },
                }],
              }],
            }]
          }]
        }),
        sequelize.models.Article.count({
          where: { topicId: article.topicId },
        }),
        includeIssues ? Promise.all(article.issues.map(issue => issue.toJson(loggedInUser))) as Promise<IssueType[]> : null,
        getIncomingLinks(sequelize, article, { type: ourbigbook.REFS_TABLE_X_CHILD, from: 'to', to: 'from' }),
        includeIssues ? Promise.all(articleTopIssues.issues.map(issue => issue.toJson(loggedInUser))) as Promise<IssueType[]> : null,
      ])
      const synonymLinks = []
      const h1ArticleInSamePage = h1ArticlesInSamePage[0]
      if (
        // False for Index pages, I think because they have no associated topic.
        // Which is correct.
        h1ArticleInSamePage
      ) {
        articleJson.topicCount = h1ArticleInSamePage.topicCount
        articleJson.hasSameTopic = h1ArticleInSamePage.hasSameTopic
      }
      const props: ArticlePageProps = {
        ancestors: ancestors.map(a => { return { slug: a.slug, titleRender: a.titleRender } }),
        article: articleJson,
        articlesInSamePage,
        articlesInSamePageForToc,
        incomingLinks: incomingLinks.map(a => { return { slug: a.slug, titleRender: a.titleRender } }),
        synonymLinks: synonymIds.map(i => { return {
          slug: idToSlug(i.idid),
          titleRender: idToSlug(i.idid),
          // TODO does not blow up, but returns empty.
          // https://docs.ourbigbook.com/todo/list-synonyms-on-metadata-section
          //titleRender: ourbigbook.renderAstFromOpts(i.ast_json, getConvertOpts({ render: true, sequelize })),
        }}),
        tagged: tagged.map(a => { return { slug: a.slug, titleRender: a.titleRender } }),
        topicArticleCount,
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson(loggedInUser)
      }
      if (includeIssues) {
        props.latestIssues = latestIssues
        props.topIssues = topIssues
        props.issuesCount = issuesCount
      }
      return { props };
    } else {
      throw new TypeError
    }
  }
}
