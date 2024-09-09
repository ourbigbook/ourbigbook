const { DataTypes, Op } = require('sequelize')

module.exports = (sequelize) => {
  const Topic = sequelize.define(
    'Topic',
    {
      articleCount: {
        // Cache of how many articles have this topic.
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
      ]
    }
  )

  Topic.getTopics = async ({
    articleOrder,
    articleWhere,
    count,
    limit,
    offset,
    order,
    orderAscDesc,
    sequelize,
  }) => {
    if (count === undefined) {
      count = true
    }
    if (orderAscDesc === undefined) {
      orderAscDesc = 'DESC'
    }
    const includeArticle = {
      model: sequelize.models.Article,
      as: 'article',
      include: [{
        model: sequelize.models.File,
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
    const orderList = [[order, orderAscDesc]]
    if (order !== 'createdAt') {
      orderList.push(['createdAt', 'DESC'])
    }
    if (articleOrder !== undefined) {
      orderList.push([{model: sequelize.models.Article, as: 'article'}, articleOrder, 'DESC'])
    }
    const args = {
      order: orderList,
      limit,
      offset,
      include,
    }
    if (count) {
      return sequelize.models.Topic.findAndCountAll(args)
    } else {
      return sequelize.models.Topic.findAll(args)
    }
  }

  Topic.prototype.toJson = async function(loggedInUser) {
    return {
      articleCount: this.articleCount,
      createdAt: this.createdAt.toISOString(),
      titleRender: this.article.titleRender,
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
      COUNT(*) AS "articleCount"
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
