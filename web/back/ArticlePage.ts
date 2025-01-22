import { getLoggedInUser } from 'back'
import { ArticlePageProps } from 'front/ArticlePage'
import {
  articleLimitSmall,
  convertContext,
  log,
  maxArticlesFetch,
  maxArticlesFetchToc,
} from 'front/config'
import { MyGetServerSideProps } from 'front/types'
import { idToSlug } from 'front/js'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import routes from 'front/routes'

import ourbigbook from 'ourbigbook'

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
                as: 'articles',
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
  return async function getServerSidePropsArticle({ params: { slug }, req, res }) {
    let t0
    if (log.perf) {
      t0 = performance.now()
    }
    if (slug instanceof Array) {
      const slugString = slug.join('/')
      const sequelize = req.sequelize
      const { Article, File, Issue, Id, Ref } = sequelize.models
      const limit = articleLimitSmall
      const [article, articleTopIssues, loggedInUser] = await Promise.all([
        Article.getArticle({
          limit,
          includeIssues,
          sequelize,
          slug: slugString,
        }),
        //// TODO benchmark the effect of this monstrous query on article pages.
        //// If very slow, we could move it to after page load.
        //// TODO don't run this on split pages? But it requires doing a separate query step, which
        //// would possibly slow things down more than this actual query?
        //Article.getArticlesInSamePage({
        //  sequelize,
        //  slug: slugString,
        //  loggedInUser,
        //}),
        Article.getArticle({
          includeIssues,
          includeIssuesOrder: 'score',
          limit,
          sequelize,
          slug: slugString,
        }),
        getLoggedInUser(req, res, loggedInUserCache),
      ])
      if (!article) {
        const redirects = await Article.findRedirects([slugString], { limit: 1 })
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
      const isIndex = article.isIndex()
      const [
        ancestors,
        articleJson,
        [articlesInSamePage, articlesInSamePageCount],
        [articlesInSamePageForToc, articlesInSamePageForTocCount],
        articleInTopicByLoggedInUser,
        h1ArticlesInSamePage,
        incomingLinks,
        issuesCount,
        otherArticlesInTopic,
        synonymIds,
        latestIssues,
        tagged,
        topIssues
      ] = await Promise.all([
        // ancestors
        article.treeFindAncestors({ attributes: ['slug', 'titleRender'] }),
        article.toJson(loggedInUser),
        // articlesInSamePage
        Article.getArticlesInSamePage({
          article,
          getCount: true,
          getTagged: true,
          loggedInUser,
          limit: maxArticlesFetch,
          list: true,
          sequelize,
          toplevelId: true,
        }),
        // articlesInSamePageForToc
        Article.getArticlesInSamePage({
          article,
          getCount: true,
          loggedInUser,
          // This 10x made this be the dominating query on /wikibot when we last benchmarked.
          // (lots or empty articles) On /cirosantilli it didn't matter as much.
          limit: maxArticlesFetchToc,
          list: true,
          // Fundamental optimization to alleviate the 10x.
          toc: true,
          sequelize,
        }),
        Article.getArticleJsonInTopicBy(loggedInUser, article.topicId),
        // h1ArticlesInSamePage
        Article.getArticlesInSamePage({
          article,
          loggedInUser,
          list: undefined,
          h1: true,
          sequelize,
        }),
        getIncomingLinks(sequelize, article, { type: ourbigbook.REFS_TABLE_X, from: 'from', to: 'to' }),
        includeIssues ? Issue.count({ where: { articleId: article.id } }) : null,
        isIndex
          ? { rows: [] }
          : Article.getArticles({
              excludeIds: [article.id],
              limit,
              offset: 0,
              order: 'score',
              sequelize,
              topicId: article.topicId,
            })
        ,
        Id.findAll({
          include: [{
            model: Ref,
            as: 'from',
            required: true,
            where: { type: Ref.Types[ourbigbook.REFS_TABLE_SYNONYM] },
            attributes: [],
            include: [{
              model: Id,
              as: 'to',
              required: true,
              attributes: [],
              include: [{
                model: File,
                as: 'toplevelId',
                required: true,
                attributes: [],
                include: [{
                  model: Article,
                  as: 'articles',
                  required: true,
                  attributes: [],
                  where: { slug: article.slug },
                }],
              }],
            }]
          }]
        }),
        includeIssues ? Promise.all(article.issues.map(issue => issue.toJson(loggedInUser))) as Promise<IssueType[]> : null,
        // Tagged.
        getIncomingLinks(sequelize, article, { type: ourbigbook.REFS_TABLE_X_CHILD, from: 'to', to: 'from' }),
        includeIssues ? Promise.all(articleTopIssues.issues.map(issue => issue.toJson(loggedInUser))) as Promise<IssueType[]> : null,
      ])
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
        ancestors: ancestors.map((a, i) => {
          return {
            hasScope: i !== 0 && ourbigbook.AstNode.fromJSON(a.file.toplevelId.ast_json, convertContext)
              .validation_output.scope.given,
            slug: a.slug,
            titleRender: a.titleRender,
            titleSource: a.file.titleSource,
          }
        }),
        article: articleJson,
        articleInTopicByLoggedInUser,
        articlesInSamePage,
        articlesInSamePageCount,
        articlesInSamePageForToc,
        articlesInSamePageForTocCount,
        incomingLinks: incomingLinks.map(a => { return { slug: a.slug, titleRender: a.titleRender } }),
        isIndex,
        loggedInUser,
        otherArticlesInTopic: await Promise.all(otherArticlesInTopic.rows.map(article => article.toJson(loggedInUser))),
        synonymLinks: synonymIds.map(i => { return {
          slug: idToSlug(i.idid),
          titleRender: idToSlug(i.idid),
          // TODO does not blow up, but returns empty.
          // https://docs.ourbigbook.com/todo/list-synonyms-on-metadata-section
          //titleRender: ourbigbook.renderAstFromOpts(i.ast_json, getConvertOpts({ render: true, sequelize })),
        }}),
        tagged: tagged.map(a => { return { slug: a.slug, titleRender: a.titleRender } }),
      }
      if (loggedInUser) {
        props.loggedInUser = await loggedInUser.toJson(loggedInUser)
      }
      if (includeIssues) {
        props.latestIssues = latestIssues
        props.topIssues = topIssues
        props.issuesCount = issuesCount
      }
      if (log.perf) {
        console.error(`perf: getServerSidePropsArticle: ${performance.now() - t0} ms`)
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
