const { DataTypes, Op } = require('sequelize')

const { sequelizeWhereStartsWith } = require('ourbigbook/models')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const { sequelizePostgresqlUserQueryToTsqueryPrefixLiteral } = ourbigbook_nodejs_webpack_safe

const front_js = require('../front/js')
const { querySearchToTopicId } = front_js

module.exports = (sequelize) => {
  const Topic = sequelize.define(
    'Topic',
    {
      articleCount: {
        // Cache of how many listed articles have this topic.
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      topicId: {
        // This is also a cache.
        // It would be possible to avoid using this field by making queries
        // that search for the linked ID. But this hits badly on a critical
        // ArticlePage view path, so we have to optimize it. TODO perhaps
        // we should actually convert topicId to point to the topic rather
        // than be a string.
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      indexes: [
        { fields: ['articleCount'] },
        { fields: ['articleId'] },
        { fields: ['topicId'] },
        // Global sort=id: stable topic ordering without sorting the complete
        // Topic table before applying a deep offset.
        {
          name: 'topic_topic_id_created_at',
          fields: [
            { name: 'topicId', order: 'DESC' },
            { name: 'createdAt', order: 'DESC' },
          ],
        },
        // Listing indexes for the three topic tabs and their empty-topic
        // filters. The partial indexes keep the default, nonempty listing from
        // walking past large runs of spam-created empty topics.
        {
          name: 'topic_article_count_created_at',
          fields: [
            { name: 'articleCount', order: 'DESC' },
            { name: 'createdAt', order: 'DESC' },
          ],
        },
        {
          name: 'topic_created_at',
          fields: [{ name: 'createdAt', order: 'DESC' }],
        },
        {
          name: 'topic_created_at_nonempty',
          fields: [{ name: 'createdAt', order: 'DESC' }],
          where: { articleCount: { [Op.gt]: 0 } },
        },
        {
          name: 'topic_topic_id_asc_created_at',
          fields: [
            { name: 'topicId', order: 'ASC' },
            { name: 'createdAt', order: 'DESC' },
          ],
        },
        {
          name: 'topic_topic_id_asc_created_at_nonempty',
          fields: [
            { name: 'topicId', order: 'ASC' },
            { name: 'createdAt', order: 'DESC' },
          ],
          where: { articleCount: { [Op.gt]: 0 } },
        },
        {
          name: 'topic_article_count_topic_id_created_at',
          fields: [
            'articleCount',
            { name: 'topicId', order: 'ASC' },
            { name: 'createdAt', order: 'DESC' },
          ],
        },
      ]
    }
  )

  Topic.getTopics = async ({
    articleOrder,
    articleWhere,
    count,
    hasArticles,
    limit,
    logging,
    offset,
    order,
    orderAscDesc,
    sequelize,
    topicId,
    topicIdSearch,
  }) => {
    const { Article, File, Topic } = sequelize.models
    if (count === undefined) {
      count = true
    }
    if (orderAscDesc === undefined) {
      orderAscDesc = 'DESC'
    }

    // where
    const where = {}
    if (hasArticles === true) {
      where.articleCount = { [Op.gt]: 0 }
    } else if (hasArticles === false) {
      where.articleCount = 0
    }
    let whereFts
    /** Get a starts with that will be accelerated both in SQLite and PostgreSQL.
     * In sequelize we need GLOB: https://stackoverflow.com/questions/8584499/should-like-searchstr-use-an-index/76512019#76512019
     * In PostgreSQL GLOB doe not exist and we setup the DB so that LIKE will work: https://dba.stackexchange.com/questions/53811/why-would-you-index-text-pattern-ops-on-a-text-column/343887#343887
     */
    if (topicIdSearch !== undefined) {
      const topicIdSearchArgs = querySearchToTopicId(topicIdSearch)
      if (sequelize.options.dialect === 'postgres') {
        whereFts = {
          ...where,
          [Op.not]: { topicId: sequelizeWhereStartsWith(sequelize, topicIdSearchArgs, '"Topic"."topicId"') },
          topicId_tsvector: { [Op.match]: sequelizePostgresqlUserQueryToTsqueryPrefixLiteral(sequelize, topicIdSearch) },
        }
      }
      where.topicId = sequelizeWhereStartsWith(sequelize, topicIdSearchArgs, '"Topic"."topicId"')
    }
    if (topicId) {
      where.topicId = topicId
    }

    const includeArticle = {
      model: Article,
      as: 'article',
      include: [{
        model: File,
        as: 'file',
      }]
    }
    if (articleWhere) {
      includeArticle.where = articleWhere
    }
    const include = [includeArticle]
    if (order === undefined) {
      order = 'articleCount'
    }
    const orderList = []
    if (topicIdSearch === undefined) {
      orderList.push([order, orderAscDesc])
      if (order !== 'createdAt') {
        orderList.push(['createdAt', 'DESC'])
      }
      if (articleOrder !== undefined) {
        orderList.push([{model: Article, as: 'article'}, articleOrder, 'DESC'])
      }
    } else {
      // See comments under getArticles why we don't do other orders with this one.
      orderList.push(['topicId', 'ASC'])
    }
    const findArgs = {
      include,
      limit,
      logging,
      offset,
      order: orderList,
      where,
    }
    const findArgss = [findArgs]
    if (whereFts) {
      findArgss.push({
        ...findArgs,
        where: whereFts,
      })
    }

    const hasArticleWhere = articleWhere && Reflect.ownKeys(articleWhere).length
    const articleFilterInclude = () => hasArticleWhere ? [{
      model: Article,
      as: 'article',
      attributes: [],
      where: articleWhere,
    }] : []
    const pageInclude = () => hasArticleWhere || articleOrder !== undefined ? [{
      model: Article,
      as: 'article',
      attributes: [],
      ...(hasArticleWhere ? { where: articleWhere } : {}),
    }] : []

    async function findPage(findArgs) {
      if (findArgs.limit === undefined) return Topic.findAll(findArgs)
      const idRows = await Topic.findAll({
        ...findArgs,
        attributes: ['id'],
        include: pageInclude(),
        raw: true,
      })
      if (!idRows.length) return []
      const idWhere = { id: { [Op.in]: idRows.map(row => row.id) } }
      return Topic.findAll({
        ...findArgs,
        limit: undefined,
        offset: undefined,
        where: { [Op.and]: [findArgs.where, idWhere] },
      })
    }

    // Do the searches.
    const rets = await Promise.all(findArgss.map(async (findArgs) => {
      if (count) {
        const [retCount, retRows] = await Promise.all([
          Topic.count({
            ...findArgs,
            attributes: undefined,
            include: articleFilterInclude(),
            limit: undefined,
            offset: undefined,
            order: undefined,
          }),
          findPage(findArgs),
        ])
        return { count: retCount, rows: retRows }
      } else {
        return { rows: await findPage(findArgs) }
      }
    }))

    // Consolidate prefix and fts searches if search is being done.
    let topics = []
    let retCount = 0
    for (const ret of rets) {
      const { rows, count } = ret
      if (rows !== undefined) {
        topics.push(...rows)
      }
      if (count !== undefined) {
        retCount += count
      }
    }
    if (limit) {
      topics = topics.slice(0, limit)
    }
    let ret
    if (count) {
      ret = { rows: topics, count: retCount }
    } else {
      ret = topics
    }
    return ret
  }

  Topic.prototype.toJson = async function(loggedInUser) {
    return {
      articleCount: this.articleCount,
      createdAt: this.createdAt.toISOString(),
      titleRender: this.article.titleRender,
      titleRenderPlaintext: this.article.titleRenderPlaintext,
      titleSource: this.article.titleSource,
      topicId: this.article.topicId,
      updatedAt: this.updatedAt.toISOString(),
    }
  }

  Topic.updateTopics = async function(articles, {
    newArticles=false,
    deleteArticle=false,
    transaction,
  }={}) {
    const { Article, Topic } = sequelize.models
    const topicIds = articles.map(article => article.topicId).filter(topicId => topicId)
    if (
      // Happens for Index pages, which have empty string topicId.
      topicIds.length
    ) {
      if (newArticles) {
        // Create any topics that don't exist.
        // Initialize their article count to 0.
        // Initialize their article to an arbitrary article that has the correct topicId.
        // This will then be corrected to the actual representative article
        // in the following query
        //
        // TODO any way to merge with the query below one that updates articleId? I don't think I can ON CONFLICT UPDATE
        // since we don't have a unique key on Topic, it is only unique across the Topic -> Article join on Article.topicId.
        //
        // We find all topics that don't exist as per:
        // https://dba.stackexchange.com/questions/141129/find-ids-from-a-list-that-dont-exist-in-a-table
        await sequelize.query(`
INSERT INTO "${Topic.tableName}" ("articleId", "topicId", "articleCount", "createdAt", "updatedAt")
SELECT "articleId", "topicId", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM (
  SELECT
    "${Article.tableName}"."id" AS "articleId",
    "${Article.tableName}"."topicId" AS "topicId",
    ROW_NUMBER() OVER (
      PARTITION BY "${Article.tableName}"."topicId"
      ORDER BY "${Article.tableName}"."id" ASC
    ) AS "rnk"
  FROM "${Article.tableName}"
  WHERE
    "${Article.tableName}"."topicId" IN (:topicIds)
    AND "${Article.tableName}"."topicId" NOT IN (
      SELECT "${Article.tableName}"."topicId"
      FROM "${Article.tableName}"
      INNER JOIN "${Topic.tableName}"
        ON "${Article.tableName}"."id" = "${Topic.tableName}"."articleId"
    )
) AS "NewTopicsAndArticleIds"
WHERE "rnk" = 1
`,
        {
          replacements: {
            topicIds,
          },
          transaction,
        }
)
      }
      if (newArticles || deleteArticle) {
        // Update article count of the topics.
        await sequelize.query(`
UPDATE "${Topic.tableName}"
  SET
    "articleCount" = "TopicIdCount"."articleCount"
FROM (
  SELECT
    "${Topic.tableName}"."id" AS "id",
    "Counts"."articleCount"
  FROM "${Topic.tableName}"
  INNER JOIN "${Article.tableName}"
    ON "${Article.tableName}"."id" = "${Topic.tableName}"."articleId"
  INNER JOIN (
    SELECT
      "topicId",
      SUM(CASE WHEN "list" THEN 1 ELSE 0 END) AS "articleCount"
    FROM "${Article.tableName}"
    GROUP BY "topicId"
    HAVING "topicId" IN (:topicIds)
  ) AS "Counts"
  ON "Counts"."topicId" = "${Article.tableName}"."topicId"
) AS "TopicIdCount"
WHERE
  "${Topic.tableName}"."id" = "TopicIdCount"."id"
`,
          {
            replacements: {
              topicIds,
            },
            transaction,
          }
        )
      }

      // Determine the representative articles for each topic, and set them.
      // Also increment article counts if needed.
      // We currently look at the most common titleRender
      // of the top 10 most voted articles. Ties are broken by picking the oldest article.
      // Minimal examples of the query can be found at:
      // * https://github.com/cirosantilli/cirosantilli.github.io/blob/master/nodejs/sequelize/raw/most_frequent.js most frequent part only
      // * https://github.com/cirosantilli/cirosantilli.github.io/blob/master/nodejs/sequelize/raw/group_by_max_n.js top N in each group part only
      await sequelize.query(`
UPDATE "${Topic.tableName}"
SET
  "articleId" = "TopArticlePerTopic"."articleId",
  "topicId" = "TopArticlePerTopic"."topicId"
FROM (
  SELECT
    "${Topic.tableName}"."id" AS "id",
    "${Article.tableName}"."topicId" AS "topicId",
    "TopArticlesPerTopic"."articleId" AS "articleId"
  FROM (
    SELECT
      "TopArticles"."topicId" AS "topicId",
      MIN("id") AS "articleId",
      COUNT(*) AS "cnt",
      ROW_NUMBER() OVER (
        PARTITION BY "TopArticles"."topicId"
        ORDER BY
          COUNT(*) DESC,
          MIN("id") ASC
      ) AS "freqRank"
    FROM (
      SELECT
        ROW_NUMBER() OVER (
          PARTITION BY "topicId"
          ORDER BY
            "score" DESC,
            "id" ASC
        ) AS "scoreRank",
        *
      FROM "${Article.tableName}"
      WHERE "topicId" IN (:topicIds)
    ) AS "TopArticles"
    WHERE "TopArticles"."scoreRank" <= :topN
    GROUP BY "TopArticles"."topicId", "titleRender"
  ) AS "TopArticlesPerTopic"
  INNER JOIN "${Article.tableName}"
    ON "${Article.tableName}"."topicId" = "TopArticlesPerTopic"."topicId"
  INNER JOIN "${Topic.tableName}"
    ON "${Topic.tableName}"."articleId" = "${Article.tableName}"."id"
  WHERE "TopArticlesPerTopic"."freqRank" = 1
  ORDER BY
    "TopArticlesPerTopic"."topicId" ASC
) AS "TopArticlePerTopic"
WHERE
  "${Topic.tableName}"."id" = "TopArticlePerTopic"."id"
`,
        {
          replacements: {
            topicIds,
            topN: 10,
          },
          transaction,
        }
      )

    }
  }


  Topic.ALLOWED_SORTS_EXTRA = {
    'article-count': 'articleCount',
    'id': 'topicId',
  }
  Topic.DEFAULT_SORT = 'articleCount'

  return Topic
}
