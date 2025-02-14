const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { DatabaseError, Sequelize, DataTypes } = require('sequelize')

const ourbigbook = require('ourbigbook')
const ourbigbook_models = require('ourbigbook/models')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe');
const {
  ID_FTS_POSTGRESL_LANGUAGE,
  sequelizeCreateTrigger,
  sequelizeCreateTriggerUpdateCount
} = ourbigbook_nodejs_webpack_safe

const config = require('../front/config')

function getSequelize(toplevelDir, toplevelBasename) {
  const sequelizeParams = Object.assign(
    {
      logging: config.log.db ? console.log : false,
      // https://stackoverflow.com/questions/52260934/how-to-measure-query-execution-time-in-seqilize
      benchmark: true,
      // https://stackoverflow.com/questions/55715724/how-to-log-queries-with-bounded-paramenters-in-sequelize/70954144#70954144
      logQueryParameters: true,
    },
    ourbigbook_nodejs_webpack_safe.DB_OPTIONS,
  );
  let sequelize;
  if (config.isProduction || config.postgres) {
    sequelizeParams.dialect = config.production.dialect;
    sequelizeParams.dialectOptions = config.production.dialectOptions;
    sequelize = new Sequelize(config.production.url, sequelizeParams);
  } else {
    sequelizeParams.dialect = config.development.dialect;
    let storage;
    if (process.env.NEXT_PUBLIC_NODE_ENV === 'test' || toplevelDir === undefined) {
      storage = ourbigbook_nodejs_webpack_safe.SQLITE_MAGIC_MEMORY_NAME;
    } else {
      if (toplevelBasename === undefined) {
        toplevelBasename = config.development.storage;
      }
      storage = path.join(toplevelDir, toplevelBasename);
    }
    sequelizeParams.storage = storage;
    sequelize = new Sequelize(sequelizeParams);
  }
  const Article = require('./article')(sequelize)
  const Comment = require('./comment')(sequelize)
  const Issue = require('./issue')(sequelize)
  const SequelizeMeta = require('./sequelize_meta')(sequelize)
  const Site = require('./site')(sequelize)
  const User = require('./user')(sequelize)
  const Upload = require('./upload')(sequelize)
  const Topic = require('./topic')(sequelize)
  ourbigbook_models.addModels(sequelize, { web: true })
  const File = sequelize.models.File

  // Associations.

  // User follow user (super many to many)
  const UserFollowUser = sequelize.define('UserFollowUser',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      followId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
    },
    {
      tableName: 'UserFollowUser',
      indexes: [
        { fields: ['userId'], },
        { fields: ['followId'], },
        { fields: ['userId', 'followId'], unique: true, },
      ],
    }
  );
  User.belongsToMany(User, { through: UserFollowUser, as: 'follows', foreignKey: 'userId', otherKey: 'followId' });
  // https://stackoverflow.com/questions/27065154/how-to-get-all-children-or-parents-in-a-many-to-many-association-if-one-model-re/72951602#72951602
  User.belongsToMany(User, { through: UserFollowUser, as: 'followed', foreignKey: 'followId', otherKey: 'userId' });
  UserFollowUser.belongsTo(User, { foreignKey: 'userId' })
  User.hasMany(UserFollowUser, { foreignKey: 'followId' })

  // User like Article
  const UserLikeArticle = sequelize.define('UserLikeArticle',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      articleId: {
        type: DataTypes.INTEGER,
        references: {
          model: Article,
          key: 'id'
        }
      },
    },
    {
      indexes: [
        // Basic JOIN and my latest/oldest given likes.
        { fields: ['userId', 'createdAt'], },
        // Basic JOIN and potential small speedup to my latest/oldest received likes.
        { fields: ['articleId', 'createdAt'], },
        { fields: ['userId', 'articleId'], unique: true, },
      ],
    }
  )
  Article.belongsToMany(User, { through: UserLikeArticle, as: 'articleLikedBy', foreignKey: 'articleId', otherKey: 'userId'  })
  User.belongsToMany(Article, { through: UserLikeArticle, as: 'likedArticles',  foreignKey: 'userId', otherKey: 'articleId'  })
  UserLikeArticle.belongsTo(User, { foreignKey: 'userId', as: 'user' })
  UserLikeArticle.belongsTo(Article, { foreignKey: 'articleId', as: 'article' })
  Article.hasMany(UserLikeArticle, { foreignKey: 'articleId', as: 'likes' })
  User.hasMany(UserLikeArticle, { foreignKey: 'userId', as: 'likes' })

  // User follow article.
  // Initial use case: get notifications when new issues are created.
  // One day could be extended to getting notified on any change.
  const UserFollowArticle = sequelize.define('UserFollowArticle',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      articleId: {
        type: DataTypes.INTEGER,
        references: {
          model: Article,
          key: 'id'
        }
      },
    },
    {
      tableName: 'UserFollowArticle',
      indexes: [
        { fields: ['userId', 'createdAt'], },
        { fields: ['articleId', 'createdAt'], },
        { fields: ['userId', 'articleId'], unique: true, },
      ],
    }
  )
  Article.belongsToMany(User, { through: UserFollowArticle, as: 'followers', foreignKey: 'articleId', otherKey: 'userId' })
  User.belongsToMany(Article, { through: UserFollowArticle, as: 'followedArticles', foreignKey: 'userId', otherKey: 'articleId' })

  // User like Issue
  const UserLikeIssue = sequelize.define('UserLikeIssue',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      issueId: {
        type: DataTypes.INTEGER,
        references: {
          model: Issue,
          key: 'id'
        }
      },
    },
    {
      indexes: [
        // Basic JOIN and my latest/oldest given likes.
        { fields: ['userId', 'createdAt'], },
        // Basic JOIN and potential small speedup to my latest/oldest received likes.
        { fields: ['issueId', 'createdAt'], },
        { fields: ['userId', 'issueId'], unique: true, },
      ],
    }
  )
  Issue.belongsToMany(User, { through: UserLikeIssue, as: 'issueLikedBy', foreignKey: 'issueId', otherKey: 'userId' })
  User.belongsToMany(Issue, { through: UserLikeIssue, as: 'likedIssues', foreignKey: 'userId', otherKey: 'issueId' })

  // User follow issue.
  // Initial use case: get notifications when new comments are created under an issue.
  const UserFollowIssue = sequelize.define('UserFollowIssue',
    {
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: User,
          key: 'id'
        }
      },
      issueId: {
        type: DataTypes.INTEGER,
        references: {
          model: Issue,
          key: 'id'
        }
      },
    },
    {
      tableName: 'UserFollowIssue',
      indexes: [
        { fields: ['userId', 'createdAt'], },
        { fields: ['issueId', 'createdAt'], },
        { fields: ['userId', 'issueId'], unique: true, },
      ],
    }
  );
  Issue.belongsToMany(User, { through: UserFollowIssue, as: 'followers', foreignKey: 'issueId', otherKey: 'userId' });
  User.belongsToMany(Issue, { through: UserFollowIssue, as: 'followedIssues', foreignKey: 'userId', otherKey: 'issueId' });

  // File author User. Deprecated in favor of Article.User
  File.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    }
  })
  User.hasMany(File, {
    as: 'authoredArticles',
    foreignKey: 'authorId'
  })

  // Article author User
  Article.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    }
  })
  User.hasMany(Article, {
    as: 'articles',
    foreignKey: 'authorId'
  })

  // Article belongs to a source File
  Article.belongsTo(File, {
    as: 'file',
    foreignKey: {
      name: 'fileId',
      // TODO https://docs.ourbigbook.com/4
      allowNull: true,
    },
    // TODO https://docs.ourbigbook.com/4
    onDelete: 'SET NULL',
  })
  File.hasMany(Article, {
    // This name is a bad idea as it breaks SQLite case insensitive madness due to conflict with File...
    // https://stackoverflow.com/questions/50926312/how-to-make-column-names-case-sensitive-of-sqlite3-in-python
    //
    // const rows = await File.findAll(
    //   {
    //     include: [
    //       {
    //         model: Article,
    //         as: 'file',
    //       },
    //     ],
    //   }
    // )
    //
    // which generates queries of type:
    //
    // SELECT
    //   count(`File`.`id`) AS `count`
    // FROM
    //   `File` AS `File`
    //   LEFT OUTER JOIN `Article` AS `file` ON `File`.`id` = `file`.`fileId`
    //
    // which blowup as:
    //
    // Parse error near line 1: ambiguous column name: File.id
    //   SELECT   count(`File`.`id`) AS `count` FROM   `File` AS `File`   LEFT OUTER JO
    //                  ^--- error here
    //
    // That could be solved e.g. by renaming file to 'files':
    //
    // LEFT OUTER JOIN `Article` AS `file` ON `File`.`id` = `file`.`fileId`
    //
    // It is all so ugly and buggy it makes us want to cry.
    //
    // More complex further nested queries may survive because they have more prefixes that differentiate between them.
    as: 'articles',
    foreignKey: 'fileId'
  })

  // Article has Issues
  Article.hasMany(Issue, {
    foreignKey: 'articleId',
    as: 'issues',
    // TODO https://docs.ourbigbook.com/todo/delete-articles
    //onDelete: 'CASCADE',
  })
  Issue.belongsTo(Article, {
    as: 'article',
    foreignKey: {
      name: 'articleId',
      allowNull: false
    },
  })

  // Issue has Comments
  Issue.hasMany(Comment, {
    foreignKey: 'issueId',
    as: 'comments',
    // TODO https://docs.ourbigbook.com/todo/delete-articles
    //onDelete: 'CASCADE',
  })
  Comment.belongsTo(Issue, {
    as: 'issue',
    foreignKey: {
      name: 'issueId',
      allowNull: false
    },
  })

  // User authors Issue
  Issue.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    },
  });
  User.hasMany(Issue, { foreignKey: 'authorId' });

  // User authors Comment
  Comment.belongsTo(User, {
    as: 'author',
    foreignKey: {
      name: 'authorId',
      allowNull: false
    },
  });
  User.hasMany(Comment, { foreignKey: 'authorId' });

  Topic.belongsTo(Article, { as: 'article' })
  Article.hasOne(Topic, { as: 'topic', foreignKey: 'articleId', constraints: false })

  Site.belongsTo(Article, { as: 'pinnedArticle', foreignKey: 'pinnedArticleId', allowNull: true })

  //Article.hasMany(Article, { as: 'sameTopic', foreignKey: 'topicId', sourceKey: 'topicId', constraints: false })

  return sequelize;
}

// Do sequelize.sync, and then also populate SequelizeMeta with migrations
// that might not be needed if we've just done a full sync.
async function sync(sequelize, opts={}) {
  let dbExists
  try {
    await sequelize.models.SequelizeMeta.findOne()
    dbExists = true
  } catch(e) {
    if (e instanceof DatabaseError) {
      dbExists = false
    }
  }
  await sequelize.sync(opts)

  // Database triggers.

    const {
      Article,
      Comment,
      File,
      Issue,
      Topic,
      User,
      UserLikeArticle,
      UserFollowArticle,
      UserLikeIssue,
      UserFollowIssue,
      UserFollowUser,
    } = sequelize.models

    await sequelizeCreateTriggerUpdateCount(sequelize, Article, UserLikeArticle, 'score', 'articleId')
    await sequelizeCreateTriggerUpdateCount(sequelize, Article, UserFollowArticle, 'followerCount', 'articleId')
    await sequelizeCreateTriggerUpdateCount(sequelize, Issue, UserLikeIssue, 'score', 'issueId')
    await sequelizeCreateTriggerUpdateCount(sequelize, Issue, UserFollowIssue, 'followerCount', 'issueId')
    await sequelizeCreateTriggerUpdateCount(sequelize, User, UserFollowUser, 'followerCount', 'followId')
    await sequelizeCreateTriggerUpdateCount(sequelize, Issue, Comment, 'commentCount', 'issueId')
    await sequelizeCreateTriggerUpdateCount(sequelize, Article, Issue, 'issueCount', 'articleId')

    // Article
    await sequelizeCreateTrigger(sequelize, Article, 'delete',
      `UPDATE "${User.tableName}" SET "score" = "${User.tableName}"."score" - OLD."score"\n` +
      `  FROM "${Article.tableName}", "${File.tableName}" WHERE OLD."fileId" = "File"."id" AND "File"."authorId" = "User"."id"`
      ,
      { after: 'BEFORE', }
    )
    await sequelizeCreateTrigger(
      sequelize,
      Article,
      'update',
      `UPDATE "${User.tableName}" SET "score" = "${User.tableName}"."score" + (NEW."score" - OLD."score")\n` +
      `  FROM "${Article.tableName}", "${File.tableName}" WHERE NEW."fileId" = "File"."id" AND "File"."authorId" = "User"."id"`
      ,
      {
        when: 'OLD."score" <> NEW."score"',
      }
    )
  const articleFtsCol = 'topicId'
  if (!dbExists || opts.force) {
    await Promise.all([
      sequelize.models.SequelizeMeta.bulkCreate(
        fs.readdirSync(path.join(path.dirname(__dirname), 'migrations')).map(
          basename => { return { name: basename } }
        )
      ),
      sequelize.models.Site.create(),
      ...(sequelize.options.dialect === 'postgres'
        ? [Article.tableName, Topic.tableName].map(t => sequelize.query(`ALTER TABLE "${t}"
  ADD COLUMN "${articleFtsCol}_tsvector" TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('${ID_FTS_POSTGRESL_LANGUAGE}', replace("${articleFtsCol}", '${ourbigbook.ID_SEPARATOR}', ' '))) STORED`).then(() =>
        sequelize.query(`CREATE INDEX "${t}_${articleFtsCol}_gin_idx"
  ON "${t}" USING GIN ("${articleFtsCol}_tsvector")`)))
        : []
      )
    ])
  }
  return dbExists
}

/** Optional check, print and update any of our denormalized in-database caches. */
async function normalize({
  check,
  fix,
  log,
  print,
  sequelize,
  usernames,
  transaction,
  whats,
}={}) {
  if (whats.length === 0 || (!check && !fix && !print)) {
    throw new Error(`nothing to be done`)
  }
  if (log === undefined) {
    log = false
  }
  if (usernames === undefined) {
    usernames = []
  }
  const { Article, Comment, Issue, File, User } = sequelize.models
  if (usernames.length === 0) {
    usernames = (await User.findAll({
      attributes: ['username'],
      order: [['username', 'ASC']],
      transaction,
    })).map(u => u.username)
  } else {
    const users = await User.findAll({ where: { username: usernames }})
    const usernameSet = new Set(users.map(u => u.username))
    for (const username of usernames) {
      if (!usernameSet.has(username)) {
        throw new Error(`user does not exist: "${username}"`)
      }
    }
  }
  for (const what of whats) {
    if (log)
      console.log(what);
    for (const username of usernames) {
      if (what === 'nested-set') {
        if (fix) {
          await Article.updateNestedSets(username, { transaction })
        }
        const articles = await Article.treeFindInOrder({ username, transaction })
        if (check) {
          const nestedSetsFromRefs = await Article.getNestedSetsFromRefs(username, { transaction })
          for (let i = 0; i < nestedSetsFromRefs.length; i++) {
            const article = articles[i]
            const fromRef = nestedSetsFromRefs[i]
            const msg = `${what}: (slug, nestedSetIndex, nestedSetNextSibling, depth): actual: (${article.slug}, ${article.nestedSetIndex}, ${article.nestedSetNextSibling}, ${article.depth}) !== expected: (${fromRef.id}, ${fromRef.nestedSetIndex}, ${fromRef.nestedSetNextSibling}, ${fromRef.depth})`
            assert.strictEqual(article.nestedSetIndex, fromRef.nestedSetIndex, msg)
            assert.strictEqual(article.nestedSetNextSibling, fromRef.nestedSetNextSibling, msg)
            assert.strictEqual(article.depth, fromRef.depth, msg)
            assert.strictEqual(`@${article.slug}`, fromRef.id, msg)
          }
        }
        if (print) {
          throw new Error('-p is broken for nested-set, does not show new would-be updated value as desired');
          for (const article of articles) {
            console.log(`${what} ${article.nestedSetIndex} ${article.nestedSetNextSibling} ${article.slug}`)
          }
        }
      } else if (
        what === 'article-issue-count' ||
        what === 'article-follower-count' ||
        what === 'issue-comment-count' ||
        what === 'issue-follower-count'
      ) {
        let parentModel, childModel, as, emptyThrough
        if (what === 'article-issue-count') {
          parentModel = Article
          childModel = Issue
          as = 'issues'
          checkField = 'issueCount'
          emptyThrough = false
        } else if(what === 'article-follower-count') {
          parentModel = Article
          childModel = User
          as = 'followers'
          checkField = 'followerCount'
          emptyThrough = true
        } else if (what === 'issue-comment-count') {
          parentModel = Issue
          childModel = Comment
          as = 'comments'
          checkField = 'commentCount'
          emptyThrough = false
        } else if (what === 'issue-follower-count') {
          parentModel = Issue
          childModel = User
          as = 'followers'
          checkField = 'followerCount'
          emptyThrough = true
        }
        const includeChild = {
          model: childModel,
          as,
          required: false,
          attributes: [],
        }
        if (emptyThrough) {
          // OMG sequelize
          includeChild.through = { attributes: [] }
        }
        const include = [
          includeChild,
        ]
        if (parentModel === Issue) {
          // Ideally, but PostgreSQL won't let us due to GROUP BY.
          //include.push({
          //  model: Article,
          //  as: 'article',
          //  attributes: ['slug'],
          //})
          slugAttr = 'number'
          include.push({
            model: User,
            as: 'author',
            where: { username },
            required: true,
            attributes: [],
          })
        } else {
          slugAttr = 'slug'
          include.push({
            model: File,
            as: 'file',
            attributes: [],
            subQuery: false,
            required: true,
            include: {
              model: User,
              as: 'author',
              where: { username },
              required: true,
              attributes: [],
            }
          })
        }
        const counts = await parentModel.findAll({
          attributes: [
            'id',
            slugAttr,
            [checkField, 'checkField'],
            [sequelize.fn('COUNT', sequelize.col(`${as}.id`)), 'count'],
          ],
          subQuery: false,
          include,
          group: [`${parentModel.name}.id`],
          order: [['id', 'ASC']],
          transaction,
        })
        if (parentModel === Issue) {
          const countsArticle = await parentModel.findAll({
            include: [
              {
                model: Article,
                as: 'article',
                attributes: ['slug'],
              },
              {
                model: User,
                as: 'author',
                where: { username },
                required: true,
                attributes: [],
              }
            ],
            order: [['id', 'ASC']],
            transaction,
          })
          for (let i = 0; i < countsArticle.length; i++) {
            counts[i].article = countsArticle[i].article
          }
        }
        for (const count of counts) {
          count.countInt = parseInt(count.get('count'), 10)
        }
        if (check) {
          for (const count of counts) {
            const msg = `${what} ${count.getSlug()} ${count.countInt} !== ${count.get('checkField')}`
            assert.strictEqual(count.countInt, count.get('checkField'), msg)
          }
        }
        if (print) {
          for (const count of counts) {
            console.log(`${what} ${count.getSlug()} ${count.get('checkField')}`);
          }
        }
        if (fix) {
          for (const count of counts) {
            if (log)
              console.log(`${what} ${count.getSlug()} ${count.countInt}`);
            await Promise.all([
              parentModel.update(
                { [checkField]: count.countInt },
                {
                  // Oopsie I did nuke timestamps once because of this O_O
                  silent: true,
                  transaction,
                  where: { id: count.id }
                }
              )
            ])
          }
        }
      } else if (
        // Not a normalization.
        what === 'follow-authored-articles'
      ) {
        const [articles, user] = await Promise.all([
          Article.getArticles({
            author: username,
            count: false,
            sequelize,
            transaction,
          }),
          User.findOne({
            where: { username },
            transaction,
          }),
        ])
        if (fix) {
          const promises = []
          for (const article of articles) {
            if (log)
              console.log(`${what} ${username} ${article.getSlug()}`);
            promises.push(user.addArticleFollowSideEffects(article, { transaction }))
          }
          await Promise.all(promises)
        }
      } else if (
        // Not a normalization.
        what === 'follow-authored-issues'
      ) {
        const [{ rows: issues }, user] = await Promise.all([
          Issue.getIssues({
            author: username,
            includeArticle: true,
            sequelize,
            transaction,
          }),
          User.findOne({
            where: { username },
            transaction,
          }),
        ])
        if (fix) {
          const promises = []
          for (const issue of issues) {
            if (log)
              console.log(`${what} ${username} ${issue.getSlug()}`);
            promises.push(user.addIssueFollowSideEffects(issue, { transaction }))
          }
          await Promise.all(promises)
        }
      } else if (
        what === 'file-has-article'
      ) {
        // Check that all files have articles. This could fail notably due to a bug in the complex synonym renaming mechanism.
        // TODO known to not work on SQLite due to case insensitive, se need to change the as: 'file" to as: 'article' in the join..
        const rows = await File.findAll({
          attributes: [
            'id',
            'path',
            [sequelize.fn('COUNT', sequelize.col('file.id')), 'count'],
          ],
          include: [
            {
              model: Article,
              as: 'file',
              required: false,
              attributes: [],
            },
            {
              model: User,
              as: 'author',
              required: true,
              attributes: [],
              where: { username },
            },
          ],
          group: ['File.id'],
          order: [[sequelize.col('count'), 'DESC']],
          having: sequelize.where(sequelize.fn('COUNT', sequelize.col('file.id')), 0)
        })
        for (const row of rows) {
          console.error(row.path)
          if (fix)
            await row.destroy()
        }
        if (check && rows.length)
          throw new Error(`there were files without a corresponding article`)
      } else if (
        what === 'topic-count' ||
        what === 'user-follower-count'
      ) {
        throw new Error(`unimplemented: ${what}`)
      } else {
        throw new Error(`unknown what: ${what}`)
      }
    }
  }
}

module.exports = {
  getSequelize,
  normalize,
  sync,
}
