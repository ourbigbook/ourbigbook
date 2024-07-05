const assert = require('assert')
const path = require('path')

const { DataTypes, Op } = require('sequelize')

const ourbigbook = require('ourbigbook')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

const config = require('../front/config')
const front_js = require('../front/js')
const convert = require('../convert')
const e = require('cors')
const { execPath } = require('process')

module.exports = (sequelize) => {
  function slugTransform(v) {
    return v
  }

  // Each Article contains rendered HTML output, analogous to a .html output file in OurBigBook CLI.
  // The input source is stored in the File model. A single file can then generate
  // multiple Article if it has multiple headers.
  const Article = sequelize.define(
    'Article',
    {
      // E.g. `johnsmith/mathematics`.
      slug: {
        type: DataTypes.TEXT,
        unique: {
          message: 'The article ID must be unique.'
        },
        set(v) {
          this.setDataValue('slug', slugTransform(v))
        },
        allowNull: false,
      },
      // E.g. for `johnsmith/mathematics` this is just the `mathematics`.
      // Can't be called just `id`, sequelize complains that it is not a primary key with that name.
      // TODO point to topic ID directly https://docs.ourbigbook.com/todo#ref-file-normalization
      topicId: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered title. Only contains the inner contents of the toplevel h1's title.
      // not the HTML header itself. Used extensively e.g. in article indexes.
      titleRender: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // This was stored here as well as in addition to in File because we previously allowed
      // multiple articles per file, just like is done locally. This was later forbidden on Web.
      // With multiple articles per file, we may have multiple title sources. And then these can
      // get used elsewhere, notably they can appears in places where the rendered output cannot
      // be displayed, e.g. <title> tags.
      titleSource: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          len: {
            args: [1, config.maxArticleTitleSize],
            msg: `Titles can have at most ${config.maxArticleTitleSize} characters`
          },
        }
      },
      titleSourceLine: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Full rendered body article excluding toplevel h1 render.
      render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered toplevel h1.
      h1Render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      // Rendered toplevel h1 as it would look like if it were an h2.
      h2Render: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      depth: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      score: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      author: {
        type: DataTypes.VIRTUAL,
        get() {
          if (this.file) {
            return this.file.author
          } else {
            return null
          }
        },
        set(value) {
          throw new Error('cannot set virtual`author` value directly');
        }
      },
      // To fetch the tree recursively on the fly.
      // https://stackoverflow.com/questions/192220/what-is-the-most-efficient-elegant-way-to-parse-a-flat-table-into-a-tree/42781302#42781302
      nestedSetIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Points to the nestedSetIndex of the next sibling, or where the
      // address at which the next sibling would be if it existed.
      nestedSetNextSibling: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      followerCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      issueCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      // If false, the article is "unlisted", i.e. it doesn't show on article lists and on the index of a parent article by default.
      list: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      // TODO updatedAt lazy to create migration now.
      indexes: [
        { fields: ['createdAt'], },
        { fields: ['issueCount'], },
        { fields: ['followerCount'], },
        { fields: ['topicId'], },
        { fields: ['slug'], },
        { fields: ['score'], },
        { fields: ['nestedSetIndex'], },
        // For parent searches.
        { fields: ['nestedSetIndex', 'nestedSetNextSibling'], },

        // Foreign key indexes https://docs.ourbigbook.com/database-guidelines
        { fields: ['fileId'], },
      ],
    }
  )

  /**
   * Move a contiguous range of siblings and all their descendants to a new location in the tree.
   *
   * Updates both nested set and Ref representations.
   *
   * @param {number} nArticlesToplevel - Total toplevel sibling articles to be moved, excluding their descendants.
   * @param {number} nArticles - Total articles to be moved, including toplevel siblings and their descendants.
   * @param {number} newNestedSetIndex - position where to move the first article of the range to.
   *
   *        This position, together with newNestedSetIndexParent, is relative to the old tree nested set state.
   *
   *        The final new index might therefore be different because we might need to close down space from which 
   *        the article was moved out after moving it out.
   */
  Article.treeMoveRangeTo = async function({
    depthDelta,
    logging,
    nArticlesToplevel,
    nArticles,
    newNestedSetIndex,
    newNestedSetIndexParent,
    newParentId,
    new_to_id_index,
    oldNestedSetIndex,
    oldNestedSetIndexParent,
    oldParentId,
    old_to_id_index,
    perf,
    transaction,
    updateNestedSetIndex,
    username,
  }) {
    if (updateNestedSetIndex === undefined) {
      updateNestedSetIndex = true
    }
    if (logging === undefined) {
      // Log previous nested set state, and the queries done on it.
      logging = false
    }
    if (logging) {
      console.log('Article.treeMoveRangeTo');
      console.log({
        depthDelta,
        nArticlesToplevel,
        nArticles,
        newNestedSetIndex,
        newNestedSetIndexParent,
        newParentId,
        new_to_id_index,
        oldNestedSetIndex,
        oldNestedSetIndexParent,
        oldParentId,
        old_to_id_index,
        updateNestedSetIndex,
        username,
      })
    }
    return sequelize.transaction({ transaction }, async (transaction) => {
      if (
        // As an optimization, skip move it position didn't change.
        oldParentId !== newParentId ||
        old_to_id_index !== new_to_id_index
      ) {
        // Open up destination space.
        await sequelize.models.Article.treeOpenSpace({
          logging,
          parentNestedSetIndex: newNestedSetIndexParent,
          nestedSetIndex: newNestedSetIndex,
          parentId: newParentId,
          perf,
          shiftNestedSetBy: nArticles,
          shiftRefBy: nArticlesToplevel,
          to_id_index: new_to_id_index,
          transaction,
          updateNestedSetIndex,
          username,
        })

        // Update indices to account for space opened upbefore insertion.
        let nestedSetDelta = newNestedSetIndex - oldNestedSetIndex
        if (newNestedSetIndex <= oldNestedSetIndex) {
          oldNestedSetIndex += nArticles
          nestedSetDelta -= nArticles
          if (oldParentId === newParentId) {
            old_to_id_index += nArticlesToplevel
          }
        }
        if (newNestedSetIndex <= oldNestedSetIndexParent) {
          oldNestedSetIndexParent += nArticles
        }

        // Move articles to new location
        if (logging) {
          console.log('Article.treeMoveRangeTo move');
          console.log(await Article.treeToString({ transaction }))
        }
        await Promise.all([
          updateNestedSetIndex && sequelize.query(`
UPDATE "Article" SET
  "nestedSetIndex" = "nestedSetIndex" + :nestedSetDelta,
  "nestedSetNextSibling" = "nestedSetNextSibling" + :nestedSetDelta,
  "depth" = "depth" + :depthDelta
WHERE
  "nestedSetIndex" >= :oldNestedSetIndex AND
  "nestedSetIndex" < :oldNestedSetNextSibling AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :username
  )
`,
            {
              logging: logging ? console.log : false,
              transaction,
              replacements: {
                depthDelta,
                oldNestedSetIndex,
                oldNestedSetNextSibling: oldNestedSetIndex + nArticles,
                nestedSetDelta,
                newNestedSetIndex,
                username,
              },
            },
          ),
          sequelize.models.Ref.update(
            {
              from_id: newParentId,
              to_id_index: sequelize.fn(`${new_to_id_index - old_to_id_index} + `, sequelize.col('to_id_index')),
            },
            {
              logging: logging ? console.log : false,
              where: {
                from_id: oldParentId,
                type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                to_id_index: {
                  [sequelize.Sequelize.Op.gte]: old_to_id_index,
                  [sequelize.Sequelize.Op.lt]: old_to_id_index + nArticlesToplevel,
                },
              },
              transaction,
            }
          )
        ])

        // Close up space where articles were removed from.
        await sequelize.models.Article.treeOpenSpace({
          logging,
          nestedSetIndex: oldNestedSetIndex,
          parentNestedSetIndex: oldNestedSetIndexParent,
          perf,
          parentId: oldParentId,
          shiftNestedSetBy: -nArticles,
          shiftRefBy: -nArticlesToplevel,
          to_id_index: old_to_id_index,
          transaction,
          updateNestedSetIndex,
          username,
        })
      }
    })
  }

  /** Sample output:
   *
   * nestedSetIndex, nestedSetNextSibling, depth, to_id_index, slug, parentId
   * 0, 4, 0, null, user0, null
   * 1, 3, 1, 0, user0/physics, @user0
   * 3, 4, 1, 1, user0/mathematics, @user0
   */
  Article.treeToString = async function(opts={}) {
    return 'nestedSetIndex, nestedSetNextSibling, depth, to_id_index, slug, parentId\n' + (
      await sequelize.models.Article.treeFindInOrder({ refs: true, transaction: opts.transaction })
    ).map(a => {
      let to_id_index, parentId
      const ref = a.file.toplevelId
      if (ref === null) {
        to_id_index = null
        parentId = null
      } else {
        to_id_index = ref.to[0].to_id_index
        parentId = ref.to[0].from_id
      }
      return `${a.nestedSetIndex}, ${a.nestedSetNextSibling}, ${a.depth}, ${to_id_index}, ${a.slug}, ${parentId}`
    }).join('\n')
  }

  Article.treeRemove = async function({
    idid,
    logging,
    nestedSetIndex,
    nestedSetNextSibling,
    parentNestedSetIndex,
    parentId,
    to_id_index,
    updateNestedSetIndex,
    username,
    transaction,
  }) {
    if (updateNestedSetIndex === undefined) {
      updateNestedSetIndex = true
    }
    if (logging === undefined) {
      logging = false
    }
    return sequelize.transaction({ transaction }, async (transaction) => {
      if (logging) {
        console.log('Article.treeRemove')
        console.log({
          idid,
          nestedSetIndex,
          nestedSetNextSibling,
          parentNestedSetIndex,
          parentId,
          to_id_index,
          username,
        })
        console.log(await Article.treeToString({ transaction }))
      }

      // Decrement the depth of all descendants of the article
      // as they are going to be moved up the tree.
      await Promise.all([
        updateNestedSetIndex && sequelize.models.Article.decrement('depth', {
          logging: logging ? console.log : false,
          where: {
            nestedSetIndex: {
              [sequelize.Sequelize.Op.gt]: nestedSetIndex,
              [sequelize.Sequelize.Op.lt]: nestedSetNextSibling,
            },
          },
          transaction,
        }),
        Article.treeOpenSpace({
          logging,
          nestedSetIndex,
          parentId,
          parentNestedSetIndex,
          shiftNestedSetBy: -1,
          // Number of descendants - 1. -1 Because we are removing the article.
          shiftRefBy: nestedSetNextSibling - (nestedSetIndex + 2),
          to_id_index,
          transaction,
          updateNestedSetIndex,
          username,
        }),
      ])
      // Change parent and increment to_id_index of all child pages
      // to fit into their new location.
      await sequelize.models.Ref.update(
        {
          from_id: parentId,
          to_id_index: sequelize.fn(`${to_id_index} + `, sequelize.col('to_id_index')),
        },
        {
          logging: logging ? console.log : false,
          where: {
            from_id: idid,
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
          transaction,
        }
      )
    })
  }

  // Remove this article from the nested set altogether.
  // Used when deleting the article. All children are reassigned to its parent.
  Article.prototype.treeRemove = async function({
    logging,
    transaction,
    updateNestedSetIndex,
  }) {
    if (logging === undefined) {
      logging = false
    }
    if (updateNestedSetIndex === undefined) {
      updateNestedSetIndex = true
    }
    const parentRef = await this.findParentRef({ transaction })
    const parentArticleToplevelId = parentRef.from
    const parentArticle = parentArticleToplevelId.toplevelId.articles[0]
    return Article.treeRemove({
      idid: parentRef.to_id,
      logging,
      nestedSetIndex: this.nestedSetIndex,
      nestedSetNextSibling: this.nestedSetNextSibling,
      parentId: parentArticleToplevelId.idid,
      parentNestedSetIndex: parentArticle.nestedSetIndex,
      to_id_index: parentRef.to_id_index,
      transaction,
      updateNestedSetIndex,
      username: (await this.getAuthor({ transaction })).username,
    })
  }

  Article.prototype.findParentRef = async function(opts={}) {
    if (this.parentRef) {
      // Cached, usually fetched via previous joins.
      return this.parentRef
    }
    return sequelize.models.Ref.findOne({
      where: {
        type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
      },
      subQuery: false,
      required: true,
      include: [
        {
          model: sequelize.models.Id,
          as: 'to',
          subQuery: false,
          required: true,
          include: [
            {
              model: sequelize.models.File,
              as: 'toplevelId',
              subQuery: false,
              required: true,
              include: [
                {
                  model: sequelize.models.Article,
                  as: 'articles',
                  subQuery: false,
                  required: true,
                  where: { slug: this.slug }
                }
              ],
            }
          ]
        },
        {
          model: sequelize.models.Id,
          as: 'from',
          subQuery: false,
          required: true,
          include: [
            {
              model: sequelize.models.File,
              as: 'toplevelId',
              subQuery: false,
              required: true,
              include: [
                {
                  model: sequelize.models.Article,
                  as: 'articles',
                  subQuery: false,
                  required: true,
                }
              ],
            }
          ]
        },
      ],
      transaction: opts.transaction,
    })
  }

  /**
   * Shift all articles after a given article by a certain ammount.
   *
   * This is the most fundamental nested set modification primitive, as it is done to:
   * * if if the shift ammount is positive: open space for new/move incoming items
   * * if the shift ammount is negative: close up space from a deleted item or from which outgoing move items left
   *
   * This primitive can be used to prepare to move multiple items at once, but 
   *
   * If negative, this removes existing space, for e.g. when removing items.
   *
   * This function also maintains Ref.to_id_index state to help keep it in sync.
   *
   * @param {boolean=} logging - enable logging of current state and queries
   * @param {number} nestedSetIndex - at which nested set index to insert or remove space from
   * @param {string} parentId - idid of the parent article. Used for Ref managment, not nested set.
   *                            TODO https://docs.ourbigbook.com/todo#ref-file-normalization
   * @param {number} parentNestedSetIndex - the parent nested set index of the nodes that will 
   *        be inserted/removed from the location. The way nested sets work, we must know this
   *        information, we can't just say how much space to open at a given location, because
   *        when inserting after nodes without children, we can either be a child or sibling
   *        or sibling of an ancestor.
   * @param {number} shiftNestedSetBy - how much to shift nested sets by
   * @param {number=} shiftRefBy - how much to shift ref to_id_index by
   * @param {number} to_id_index - the new to_id_index of the article within its parent. Used for Ref managemnt, not nested set.
   * @param {Transaction=} transaction
   * @param {string} username - username to take effect on
   */
  Article.treeOpenSpace = async function({
    logging,
    nestedSetIndex,
    parentId,
    parentNestedSetIndex,
    perf,
    shiftNestedSetBy,
    shiftRefBy,
    to_id_index,
    transaction,
    updateNestedSetIndex,
    username,
  }) {
    if (logging === undefined) {
      // Log previous nested set state, and the queries done on it.
      logging = false
    }
    if (updateNestedSetIndex === undefined) {
      updateNestedSetIndex = true
    }
    let t0
    if (perf) {
      t0 = performance.now();
      console.error('perf: treeOpenSpace.start');
    }
    if (
      // Happens for the root node. The root cannot move, so we just skip that case.
      parentNestedSetIndex !== undefined
    ) {
      if (logging) {
        console.log('Article.treeOpenSpace')
        console.log({
          nestedSetIndex,
          parentId,
          parentNestedSetIndex,
          shiftNestedSetBy,
          shiftRefBy,
          to_id_index,
          updateNestedSetIndex,
          username,
        })
        console.log(await Article.treeToString({ transaction }))
      }
      await sequelize.transaction({ transaction }, async (transaction) => {
        return Promise.all([
          // Increment sibling indexes after point we are inserting from.
          sequelize.models.Ref.increment('to_id_index', {
            logging: logging ? console.log : false,
            by: shiftRefBy,
            where: {
              from_id: parentId,
              to_id_index: { [sequelize.Sequelize.Op.gte]: to_id_index },
              type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
            },
            transaction,
          }),
          // Increase nested set index and next sibling of all nodes that come after.
          // We need a raw query because Sequelize does not support UPDATE with JOIN:
          // https://github.com/sequelize/sequelize/issues/3957
          updateNestedSetIndex && sequelize.query(`
UPDATE "Article" SET
  "nestedSetIndex" = "nestedSetIndex" + :shiftNestedSetBy,
  "nestedSetNextSibling" = "nestedSetNextSibling" + :shiftNestedSetBy
WHERE
  "nestedSetIndex" >= :nestedSetIndex AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :username
  )
`,
            {
              logging: logging ? console.log : false,
              transaction,
              replacements: {
                username,
                nestedSetIndex,
                shiftNestedSetBy,
              },
            },
          ),

          // Increase nested set next sibling of ancestors. Their index is unchanged.
          updateNestedSetIndex && sequelize.query(`
UPDATE "Article" SET
  "nestedSetNextSibling" = "nestedSetNextSibling" + :shiftNestedSetBy
WHERE
  "nestedSetIndex" <= :parentNestedSetIndex AND
  "nestedSetNextSibling" >= :nestedSetIndex AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :username
  )
`,
            {
              logging: logging ? console.log : false,
              transaction,
              replacements: {
                username,
                nestedSetIndex,
                parentNestedSetIndex,
                shiftNestedSetBy,
              },
            },
          ),
        ])
      })
    }
    if (perf) {
      console.error(`perf: treeOpenSpace.finish ${performance.now() - t0} ms`);
    }
  }

  // TODO https://docs.ourbigbook.com/todo/delete-articles
  Article.prototype.destroySideEffects = async function(opts={}) {
    return sequelize.transaction({ transaction: opts.transaction }, async (transaction) => {
      const [articles, topic, _] = await Promise.all([
        sequelize.models.Article.findAll({
          where: { topicId: this.topicId },
          limit: 2,
          order: [['id', 'ASC']],
          transaction,
        }),
        sequelize.models.Topic.findOne({
          include: [{
            model: sequelize.models.Article,
            as: 'article',
            where: { topicId: this.topicId },
          }],
          transaction,
        }),
        this.treeRemove({
          logging: opts.logging,
          transaction
        }),
      ])
      let otherArticleSameTopic
      if (articles.length > 1) {
        if (articles[0].id === this.id) {
          otherArticleSameTopic = articles[1]
        } else {
          otherArticleSameTopic = articles[0]
        }
      }
      await this.destroy({ transaction })
      return Promise.all([
        this.parentRef ? this.parentRef.destroy({ transaction }) : null,
        // Has to come after File.destroy finished because the file is needed in order for the
        // DELETE ARTICLE trigger to be able to link the article to the author.
        //
        // Cannot be easily done on CASCADE currently because we had a setup where each File
        // could have many Articles, which is basically gone.
        this.file.destroy({ transaction }),
        otherArticleSameTopic
          ? // Set it to another article provisorily just in case it points to the current article,
            // because we are going to destroy the current article.
            topic.update({ articleId: otherArticleSameTopic.id }, { transaction }).then(
              // Then update to whatever is actually correct.
              () => sequelize.models.Topic.updateTopics([ otherArticleSameTopic ], { deleteArticle: true, transaction })
            )
            : topic.destroy({ transaction })
      ])
      // TODO move child articles to parent
      // destroy issues, and then comments. Not doig this now because our "deletion" is for migration to another article only initially
      //   This can be done on delete cascade as there are no side effects of issues/comments that are not taken care of by triggers
      //   Sequelize does not set on delete cascade by default however on belongsTo, it uses on delete set null, which would need changing
    })
  }

  Article.prototype.getAuthor = async function() {
    return (await this.getFileCached()).author
  }

  Article.prototype.getFileCached = async function() {
    let file
    if (!this.file || this.file.author === undefined) {
      file = await this.getFile({ include: [ { model: sequelize.models.User, as: 'author' } ]})
    } else {
      file = this.file
    }
    return file
  }

  // Get a version of the source code of this article that would be
  // written to a local file if we were to export it.
  Article.prototype.getSourceExport = async function() {
    const file = await this.getFileCached()
    let ret = front_js.modifyEditorInput(file.titleSource, file.bodySource).new
    const children = await this.getChildren()
    let include_source = ''
    const isToplevelIndex = this.isToplevelIndex()
    for (const child of children) {
      let inc_orig = this.slug
      if (!isToplevelIndex) {
        inc_orig = inc_orig.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(0, -1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
      }
      include_source += `\\Include[${path.relative(inc_orig, child.slug)}]\n`
    }
    if (include_source) {
      if (ret[ret.length - 1] !== '\n') {
        ret += '\n'
      }
      ret += '\n' + include_source
    }
    return ret
  }

  Article.prototype.getChildren = async function() {
    return sequelize.models.Article.findAll({
      where: {
        nestedSetIndex: {
          [sequelize.Sequelize.Op.gt]: this.nestedSetIndex,
          [sequelize.Sequelize.Op.lt]: this.nestedSetNextSibling,
        },
        depth: this.depth + 1,
      },
      order: [['nestedSetIndex', 'ASC']],
      include: [{
        model: sequelize.models.File,
        as: 'file',
        required: true,
        include: [{
          model: sequelize.models.User,
          as: 'author',
          where: { username: this.file.author.username },
          required: true,
        }]
      }]
    })
  }

  Article.prototype.toJson = async function(loggedInUser) {
    const authorPromise = this.file && this.file.author ? this.file.author : this.getAuthor()
    // TODO do liked and followed with JOINs on caller, check if it is there and skip this if so.
    const [liked, followed, author, likedBy] = await Promise.all([
      loggedInUser ? loggedInUser.hasLikedArticle(this.id) : false,
      loggedInUser ? loggedInUser.hasFollowedArticle(this.id) : false,
      (await authorPromise).toJson(loggedInUser),
      this.likedBy ? this.likedBy.toJson(loggedInUser) : undefined,
    ])
    function addToDictWithoutUndefined(target, source, keys) {
      for (const prop of keys) {
        const val = source[prop]
        if (val !== undefined) {
          target[prop] = val
        }
      }
      return target
    }
    const file = {}
    if (this.file) {
      addToDictWithoutUndefined(file, this.file, ['titleSource', 'bodySource', 'path', 'hash'])
    }
    const ret = {
      followed,
      liked,
      // Putting it here rather than in the more consistent file.author
      // to improve post serialization polymorphism with issues.
      author,
      file,
    }
    this.topicCount = this.get('topicCount')
    addToDictWithoutUndefined(ret, this, [
      'depth',
      'followerCount',
      'h1Render',
      'h2Render',
      'id',
      'issueCount',
      'list',
      'slug',
      'hash',
      'topicId',
      'titleRender',
      'titleSource',
      'titleSourceLine',
      'score',
      'render',
      'issueCount',
      'topicCount'
    ])
    if (this.createdAt) {
      ret.createdAt = this.createdAt.toISOString()
    }
    if (this.updatedAt) {
      ret.updatedAt = this.updatedAt.toISOString()
    }
    if (likedBy) {
      ret.likedBy = likedBy
    }
    if (this.likedByDate) {
      ret.likedByDate = this.likedByDate.toISOString()
    }
    if (this.parentId) {
      ret.parentId = this.parentId.idid
    }
    if (this.previousSiblingId) {
      ret.previousSiblingId = this.previousSiblingId.idid
    }
    return ret
  }

  Article.prototype.rerender = async function({ convertOptionsExtra, ignoreErrors, transaction }={}) {
    const file = await this.getFileCached()
    if (ignoreErrors === undefined)
      ignoreErrors = false
    await sequelize.transaction({ transaction }, async (transaction) => {
      try {
        await convert.convertArticle({
          author: file.author,
          bodySource: file.bodySource,
          convertOptionsExtra,
          forceNew: false,
          path: ourbigbook.pathSplitext(file.path.split(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR).slice(1).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR))[0],
          parentId: this.file.toplevelId.to[0].from.idid,
          render: true,
          sequelize,
          titleSource: file.titleSource,
          transaction,
          updateTree: false,
        })
      } catch(e) {
        if (ignoreErrors) {
          console.log(e)
        } else {
          throw e
        }
      }
    })
  }

  Article.prototype.isToplevelIndex = function() {
    return !this.slug.includes(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
  }

  /**
   * Return Articles ordered by username and nested sets.
   * @return {Article[]}
   */
  Article.treeFindInOrder = async function(opts={}) {
    const userWhere = {}
    const username = opts.username
    if (username) {
      userWhere.username = username
    }
    const fileIncludes = [{
      model: sequelize.models.User,
      as: 'author',
      where: userWhere,
      required: true,
    }]
    if (opts.refs) {
      fileIncludes.push({
        model: sequelize.models.Id,
        as: 'toplevelId',
        include: [{
          model: sequelize.models.Ref,
          as: 'to',
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
        }]
      })
    }
    const where = {}
    if (
      // These happen on "updateNestedNsetIndex=false updates"
      !opts.includeNulls
    ) {
      where.nestedSetIndex = {[sequelize.Sequelize.Op.ne]: null}
    }
    const include = [
      {
        model: sequelize.models.File,
        as: 'file',
        required: true,
        include: fileIncludes,
      }
    ]
    return sequelize.models.Article.findAll({
      include,
      where,
      order: [
        [
          { model: sequelize.models.File, as: 'file' },
          { model: sequelize.models.User, as: 'author' },
          'username',
          'ASC'
        ],
        ['nestedSetIndex', 'ASC NULLS FIRST'],
        // To disambiguate the order of NULLs.
        ['slug', 'ASC'],
      ],
      transaction: opts.transaction,
    })
  }

  Article.prototype.treeFindAncestors = async function(opts={}) {
    return Article.findAll({
      attributes: opts.attributes,
      where: {
        nestedSetIndex: { [sequelize.Sequelize.Op.lt]: this.nestedSetIndex },
        nestedSetNextSibling: { [sequelize.Sequelize.Op.gt]: this.nestedSetIndex },
      },
      include: [{
        model: sequelize.models.File,
        as: 'file',
        required: true,
        where: { authorId: this.file.authorId },
      }],
      order: [['nestedSetIndex', 'ASC']],
    })
  }

  Article.getArticleIncludeParentAndPreviousSiblingFileInclude = function(
    sequelize,
  ) {
    // Behold.
    // TODO reimplement with the nested index information instead of this megajoin.
    return {
      model: sequelize.models.Id,
      as: 'toplevelId',
      subQuery: false,
      include: [{
        model: sequelize.models.Ref,
        as: 'to',
        where: {
          type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
        subQuery: false,
        include: [{
          // Parent ID.
          model: sequelize.models.Id,
          as: 'from',
          subQuery: false,
          include: [
            {
              model: sequelize.models.File,
              as: 'toplevelId',
              include: [
                {
                  model: sequelize.models.Article,
                  as: 'articles',
                },
              ]
            },
            {
              model: sequelize.models.Ref,
              as: 'from',
              subQuery: false,
              on: {
                '$file->toplevelId->to->from->from.from_id$': {[Op.eq]: sequelize.col('file->toplevelId->to->from.idid')},
                '$file->toplevelId->to->from->from.to_id_index$': {[Op.eq]: sequelize.where(sequelize.col('file->toplevelId->to.to_id_index'), '-', 1)},
              },
              include: [{
                // Previous sibling ID.
                model: sequelize.models.Id,
                as: 'to',
                include: [
                  {
                    model: sequelize.models.File,
                    as: 'toplevelId',
                  },
                ],
              }],
            }
          ],
        }],
      }],
    }
  }

  Article.getArticleIncludeParentAndPreviousSiblingAddShortcuts = function(
    article,
  ) {
    // Some access helpers, otherwise too convoluted!.
    const articleId = article.file.toplevelId
    if (articleId) {
      const parentRef = articleId.to[0]
      const parentId = parentRef.from
      article.parentRef = parentRef
      article.parentId = parentId
      article.idid = articleId.idid
      article.parentArticle = parentId.toplevelId.articles[0]
      const previousSiblingRef = parentId.from[0]
      if (previousSiblingRef) {
        article.previousSiblingRef = previousSiblingRef
        article.previousSiblingId = previousSiblingRef.to
      }
    }
  }

  Article.getArticle = async function({
    includeIssues,
    includeIssueNumber,
    includeIssuesOrder,
    includeParentAndPreviousSibling,
    sequelize,
    slug,
  }) {
    const fileInclude = [
      {
        model: sequelize.models.User,
        as: 'author',
      },
      {
        model: sequelize.models.Render,
        where: {
          type: sequelize.models.Render.Types[ourbigbook.OUTPUT_FORMAT_HTML],
        },
        required: false,
      },
    ]
    if (includeParentAndPreviousSibling) {
      fileInclude.push(Article.getArticleIncludeParentAndPreviousSiblingFileInclude(sequelize))
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: fileInclude,
    }]
    let order
    if (includeIssues) {
      const includeIssue = {
        model: sequelize.models.Issue,
        as: 'issues',
        required: false,
        include: [{ model: sequelize.models.User, as: 'author' }],
      }
      if (includeIssueNumber) {
        includeIssue.where = { number: includeIssueNumber }
      }
      include.push(includeIssue)
      order = [[
        'issues', includeIssuesOrder === undefined ? 'createdAt' : includeIssuesOrder, 'DESC'
      ]]
    }
    const article = await sequelize.models.Article.findOne({
      where: { slug },
      include,
      order,
      subQuery: false,
    })
    if (includeParentAndPreviousSibling && article !== null) {
      Article.getArticleIncludeParentAndPreviousSiblingAddShortcuts(article)
    }
    return article
  }

  // Helper for common queries.
  Article.getArticles = async ({
    author,
    count,
    excludeIds,
    followedBy,
    // TODO this is quite broken on true:
    // https://docs.ourbigbook.com/todo/fix-parentid-and-previoussiblingid-on-articles-api
    includeParentAndPreviousSibling,
    likedBy,
    limit,
    list,
    offset,
    order,
    orderAscDesc,
    rows=true,
    sequelize,
    slug,
    topicId,
    transaction,
  }) => {
    if (orderAscDesc === undefined) {
      orderAscDesc = 'DESC'
    }
    if (count === undefined) {
      count = true
    }
    if (excludeIds === undefined) {
      excludeIds = []
    }

    let where = {}
    if (excludeIds.length) {
      where.id = { [sequelize.Sequelize.Op.notIn]: excludeIds }
    }
    if (list !== undefined) {
      where.list = list
    }
    const fileInclude = []
    const authorInclude = {
      model: sequelize.models.User,
      as: 'author',
      required: true,
    }
    if (author) {
      authorInclude.where = { username: author }
    }
    fileInclude.push(authorInclude)
    if (includeParentAndPreviousSibling) {
      fileInclude.push(Article.getArticleIncludeParentAndPreviousSiblingFileInclude(sequelize))
    }
    const include = [{
      model: sequelize.models.File,
      as: 'file',
      include: fileInclude,
      required: true,
    }]
    if (followedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'followers',
        where: { username: followedBy },
      })
    }
    if (likedBy) {
      include.push({
        model: sequelize.models.User,
        as: 'articleLikedBy',
        where: { username: likedBy },
      })
    }
    if (slug) {
      where.slug = slug
    }
    if (topicId) {
      where.topicId = topicId
    }
    const orderList = []
    if (order !== undefined) {
      orderList.push([order, orderAscDesc])
    }
    if (order !== 'createdAt') {
      // To make results deterministic.
      orderList.push(['createdAt', 'DESC'])
    }
    if (Object.keys(where).length === 0) {
      where = undefined;
    }
    const findArgs = {
      include,
      limit,
      offset,
      order: orderList,
      transaction,
      where,
    }
    let ret, articles
    if (count) {
      if (rows) {
        ret = await sequelize.models.Article.findAndCountAll(findArgs)
        articles = ret.rows
      } else {
        ret = { count: await sequelize.models.Article.count(findArgs) }
      }
    } else {
      ret = await sequelize.models.Article.findAll(findArgs)
      articles = ret
    }
    if (includeParentAndPreviousSibling) {
      for (const article of articles) {
        Article.getArticleIncludeParentAndPreviousSiblingAddShortcuts(article)
      }
    }
    return ret;
  }

  Article.getArticleJsonInTopicBy = async (user, topicId) => {
    return user
      ? sequelize.models.Article.findOne({
          where: {
            topicId,
          },
          include: [
            {
              model: sequelize.models.File,
              as: 'file',
              where: {
                authorId: user.id,
              }
            }
          ]
        }).then(article => {
          if (article) {
            return article?.toJson(user)
          } else {
            return null
          }
        })
      : null
  }

  // Maybe try to merge into getArticle one day?
  Article.getArticlesInSamePage = async ({
    article,
    loggedInUser,
    // Get just the article itself. This is just as a way to get the number of
    // articles on same topic + discussion count which we already get the for the h2,
    // which are the main use case of this function.
    //
    // We don't want to pull both of them together because then we'd be pulling
    // both h1 and h2 renders which we don't need. Talk about premature optimization!
    h1,
    limit,
    list,
    render,
    sequelize,
  }) => {
    if (render === undefined) {
      render = true
    }
//    // OLD VERSION 1: as much as possible from calls, same article by file.
//    const articlesInSamePageAttrs = [
//      'id',
//      'score',
//      'slug',
//      'topicId',
//    ]
//    const include = [
//      {
//        model: sequelize.models.File,
//        as: 'file',
//        required: true,
//        attributes: ['id'],
//        include: [
//          {
//            model: sequelize.models.User,
//            as: 'author',
//          },
//          {
//            model: sequelize.models.Article,
//            as: 'file',
//            required: true,
//            attributes: ['id'],
//            where: { slug },
//          }
//        ]
//      },
//      {
//        model: sequelize.models.Issue,
//        as: 'issues',
//      },
//      {
//        model: sequelize.models.Article,
//        as: 'sameTopic',
//        attributes: [],
//        required: true,
//        include: [{
//          model: sequelize.models.Topic,
//          as: 'article',
//          required: true,
//        }]
//      },
//    ]
//    // This is the part I don't know how to do here. Analogous for current user liked check.
//    // It works, but breaks "do I have my version check".
//    // https://github.com/cirosantilli/cirosantilli.github.io/blob/1be5cb8ef7c03d03e54069c6a5329f54e044de9c/nodejs/sequelize/raw/many_to_many.js#L351
//    //if (loggedInUser) {
//    //  include.push({
//    //    model: sequelize.models.Article,
//    //    as: 'sameTopic2',
//    //    //attributes: [],
//    //    required: true,
//    //    include: [{
//    //      model: sequelize.models.File,
//    //      as: 'file',
//    //      //attributes: [],
//    //      required: true,
//    //      include: [{
//    //        model: sequelize.models.User,
//    //        as: 'author',
//    //        attributes: ['id'],
//    //        required: false,
//    //        where: { id: loggedInUser.id },
//    //      }]
//    //    }],
//    //  })
//    //}
//    return sequelize.models.Article.findAll({
//      attributes: articlesInSamePageAttrs.concat([
//        [sequelize.fn('COUNT', sequelize.col('issues.id')), 'issueCount'],
//        [sequelize.col('sameTopic.article.articleCount'), 'topicCount'],
//        // This works for "do I have my version check".
//        //[sequelize.fn('max', sequelize.col('sameTopic2.file.author.id')), 'hasSameTopic'],
//      ]),
//      group: articlesInSamePageAttrs.map(a => `Article.${a}`),
//      subQuery: false,
//      order: [['topicId', 'ASC']],
//      include,
//    })
//
//    // OLD VERSION 2: same article by file, one megaquery.
//    // For a minimal prototype of the difficult SameTopicByLoggedIn part:
//    // https://github.com/cirosantilli/cirosantilli.github.io/blob/1be5cb8ef7c03d03e54069c6a5329f54e044de9c/nodejs/sequelize/raw/many_to_many.js#L351
//    ;const [rows, meta] = await sequelize.query(`
//SELECT
//  "Article"."id" AS "id",
//  "Article"."score" AS "score",
//  "Article"."slug" AS "slug",
//  "Article"."topicId" AS "topicId",
//  "Article"."titleSource" AS "titleSource",
//  "File.Author"."id" AS "file.author.id",
//  "File.Author"."username" AS "file.author.username",
//  "SameTopic"."articleCount" AS "topicCount",
//  "ArticleSameTopicByLoggedIn"."id" AS "hasSameTopic",
//  "UserLikeArticle"."userId" AS "liked",
//  COUNT("issues"."id") AS "issueCount"
//FROM
//  "Article"
//  INNER JOIN "File" ON "Article"."fileId" = "File"."id"
//  LEFT OUTER JOIN "User" AS "File.Author" ON "File"."authorId" = "File.Author"."id"
//  INNER JOIN "Article" AS "ArticleSameFile"
//    ON "File"."id" = "ArticleSameFile"."fileId"
//    AND "ArticleSameFile"."slug" = :slug
//  INNER JOIN "Article" AS "ArticleSameTopic" ON "Article"."topicId" = "ArticleSameTopic"."topicId"
//  INNER JOIN "Topic" AS "SameTopic" ON "ArticleSameTopic"."id" = "SameTopic"."articleId"
//  LEFT OUTER JOIN (
//    SELECT "Article"."id", "Article"."topicId"
//    FROM "Article"
//    INNER JOIN "File"
//      ON "Article"."fileId" = "File"."id"
//      AND "File"."authorId" = :loggedInUserId
//  ) AS "ArticleSameTopicByLoggedIn"
//    ON "Article"."topicId" = "ArticleSameTopicByLoggedIn"."topicId"
//  LEFT OUTER JOIN "UserLikeArticle"
//    ON "UserLikeArticle"."articleId" = "Article"."id" AND
//       "UserLikeArticle"."userId" = :loggedInUserId
//  LEFT OUTER JOIN "Issue" AS "issues" ON "Article"."id" = "issues"."articleId"
//GROUP BY
//  "Article"."id",
//  "Article"."score",
//  "Article"."slug",
//  "Article"."topicId",
//  "Article"."titleSource",
//  "File.Author"."id",
//  "File.Author"."username",
//  "SameTopic"."articleCount",
//  "ArticleSameTopicByLoggedIn"."id",
//  "UserLikeArticle"."userId"
//ORDER BY "slug" ASC
//`,
//      {
//        replacements: {
//          loggedInUserId: loggedInUser ? loggedInUser.id : null,
//          slug,
//        }
//      }
//    )

    //const allFields = {
    //  'id'
    //  'score',
    //  'slug',
    //  'topicId',
    //  'titleSource',
    //  'render',
    //}

    ;const [rows, meta] = await sequelize.query(`
SELECT
  "Article"."id" AS "id",
  "Article"."list" AS "list",
  "Article"."score" AS "score",
  "Article"."slug" AS "slug",
  "Article"."topicId" AS "topicId",
  "Article"."issueCount" AS "issueCount",
  "Article"."titleSource" AS "titleSource",${render ? `\n  "Article"."render" AS "render",` : ''}
  ${h1 ? '"Article"."h1Render" AS "h1Render"' : '"Article"."h2Render" AS "h2Render"'},
  "Article"."topicId" AS "topicId",
  "Article"."titleRender" AS "titleRender",
  "Article"."depth" AS "depth",
  "File.Author"."id" AS "file.author.id",
  "File.Author"."username" AS "file.author.username",
  "SameTopic"."articleCount" AS "topicCount",
  "ArticleSameTopicByLoggedIn"."id" AS "hasSameTopic",
  "UserLikeArticle"."userId" AS "liked"
FROM
  "Article"
  INNER JOIN "File" ON "Article"."fileId" = "File"."id"${h1 ? '\n  INNER JOIN "Id" ON "File"."toplevel_id" = "Id"."idid"' : ''}
  INNER JOIN "User" AS "File.Author"
    ON "File"."authorId" = "File.Author"."id" AND
       "File.Author"."username" = :authorUsername
  INNER JOIN "Article" AS "ArticleSameTopic" ON "Article"."topicId" = "ArticleSameTopic"."topicId"
  INNER JOIN "Topic" AS "SameTopic" ON "ArticleSameTopic"."id" = "SameTopic"."articleId"
  LEFT OUTER JOIN (
    SELECT "Article"."id", "Article"."topicId"
    FROM "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
      AND "File"."authorId" = :loggedInUserId
  ) AS "ArticleSameTopicByLoggedIn"
    ON "Article"."topicId" = "ArticleSameTopicByLoggedIn"."topicId"
  LEFT OUTER JOIN "UserLikeArticle"
    ON "UserLikeArticle"."articleId" = "Article"."id" AND
       "UserLikeArticle"."userId" = :loggedInUserId
  LEFT OUTER JOIN "Issue" AS "issues" ON "Article"."id" = "issues"."articleId"
  ${h1
    ? `WHERE "Article"."nestedSetIndex" = :nestedSetIndex`
    : `WHERE "Article"."nestedSetIndex" > :nestedSetIndex AND
    "Article"."nestedSetIndex" < :nestedSetNextSibling`
  }
  ${list === undefined ? '' : `AND "Article"."list" = :list`}
GROUP BY
  "Article"."id",
  "Article"."score",
  "Article"."slug",
  "Article"."topicId",
  "Article"."titleSource",
  "File.Author"."id",
  "File.Author"."username",
  "SameTopic"."articleCount",
  "ArticleSameTopicByLoggedIn"."id",
  "UserLikeArticle"."userId"
ORDER BY "Article"."nestedSetIndex" ASC${limit !== undefined ? `
LIMIT ${limit}` : ''}
`,
      {
        replacements: {
          authorUsername: article.author.username,
          loggedInUserId: loggedInUser ? loggedInUser.id : null,
          list,
          nestedSetIndex: article.nestedSetIndex,
          nestedSetNextSibling: article.nestedSetNextSibling,
        }
      }
    )

    //sequelize.query(`
    //FROM "Article"
    //WHERE "nestedSetIndex" > :nestedSetIndex AND "nestedSetIndex" < :nestedSetNextSibling
    //ORDER BY "nestedSetIndex" ASC
    //     {
    //       replacements: {
    //         nestedSetIndex: article.nestedSetIndex,
    //         nestedSetNextSibling: article.nestedSetNextSibling,
    //       }
    //     }
    //   ),
    //`)
    for (const row of rows) {
      row.hasSameTopic = row.hasSameTopic === null ? false : true
      row.liked = row.liked === null ? false : true
      row.author = {
        id: row['file.author.id'],
        username: row['file.author.username'],
      }
      delete row['file.author.id']
      delete row['file.author.username']
    }
    return rows
  }

  /**
   * Calculate nested sets from Ref information and return this data.
   * As of creating this function, this was supposed to be incrementally
   * done by the convertArticle() internal function. But we are considering
   * doing it in bulk to speed things up. And also creating this to quickfix
   * a wrong index observed in production for unknown reasons:
   * https://docs.ourbigbook.com/subsections-missing-on-web-dynamic-tree
   *
   * @param {string} username
   */
  Article.getNestedSetsFromRefs = async function(username, { transaction }={}) {
    const toplevelId = `${ourbigbook.AT_MENTION_CHAR}${username}`
    const idRows = await ourbigbook_nodejs_webpack_safe.fetch_header_tree_ids(
      sequelize,
      [toplevelId],
      {
        // Saves memory 3x. Still doesn't scale indefinitely, but helps as a workaround.
        idAttrs: '"level","from_id","idid"',
        transaction,
      },
    )
    let idTreeNode = {
      id: toplevelId,
      children: [],
      nextSibling: undefined,
      parent: undefined,
      depth: 0,
      nestedSetIndex: undefined,
      nestedSetNextSibling: undefined,
    }
    const idToIdTreeNode = {
      [toplevelId]: idTreeNode,
    }
    for (const row of idRows) {
      const depth = row.level + 1
      const parent = idToIdTreeNode[row.from_id]
      const childIdx = parent.children.length
      const idTreeNode = {
        id: row.idid,
        children: [],
        childIdx,
        depth,
        parent,
        nestedSetIndex: undefined,
        nestedSetNextSibling: undefined,
      }
      if (childIdx > 0) {
        parent.children[childIdx - 1].nextSibling = idTreeNode
      }
      idToIdTreeNode[row.idid] = idTreeNode
      parent.children.push(idTreeNode)
    }
    const nestedSet = []

    // Calculated nestedSetIndex, a simple pre-order traversal.
    let i = 0
    let todo = [idTreeNode]
    while (todo.length) {
      const node = todo.pop()
      node.nestedSetIndex = i
      nestedSet.push(node)
      todo.push(...node.children.slice().reverse())
      i++
    }

    // Calculate nestedSetNextSibling.
    // Needs a second pass because it relies on the indices of nodes we
    // haven't visited yet on the first pass.
    todo = [idTreeNode]
    while (todo.length) {
      const node = todo.pop()
      if (node.nextSibling) {
        node.nestedSetNextSibling = node.nextSibling.nestedSetIndex
      } else if (node.children.length === 0) {
        const nextSibling = node.nestedSetIndex + 1
        node.nestedSetNextSibling = nextSibling
        let ancestor = node.parent
        while(
          ancestor !== undefined &&
          ancestor.nextSibling === undefined
        ) {
          ancestor.nestedSetNextSibling = nextSibling
          ancestor = ancestor.parent
        }
      }
      todo.push(...node.children.slice().reverse())
    }
    return nestedSet
  }

  Article.findRedirects = async (fromSlugs, { limit, offset } = {}) => {
    const refs = await sequelize.models.Ref.findAll({
      where: {
        type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
        from_id: fromSlugs.map(s => `${ourbigbook.AT_MENTION_CHAR}${s}`),
      },
      limit,
      offset,
    })
    const ret = {}
    for (const ref of refs) {
      ret[ref.from_id.slice(ourbigbook.AT_MENTION_CHAR.length)] = ref.to_id.slice(ourbigbook.AT_MENTION_CHAR.length)
    }
    return ret
  }

  /** Re-render multiple articles. */
  Article.rerender = async ({
    author,
    convertOptionsExtra,
    ignoreErrors,
    log,
    slugs
  }={}) => {
    if (log === undefined)
      log = false
    const where = {}
    if (slugs.length) {
      where.slug = slugs
    }
    const authorWhere = {}
    if (author) {
      authorWhere.username = author
    }
    let offset = 0
    while (true) {
      const articles = await sequelize.models.Article.findAll({
        where,
        subQuery: false,
        include: [
          {
            model: sequelize.models.File,
            as: 'file',
            subQuery: false,
            required: true,
            include: [
              {
                model: sequelize.models.User,
                as: 'author',
                subQuery: false,
                required: true,
                where: authorWhere,
              },
              {
                model: sequelize.models.Id,
                as: 'toplevelId',
                subQuery: false,
                required: true,
                include: [{
                  model: sequelize.models.Ref,
                  as: 'to',
                  subQuery: false,
                  where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT] },
                  include: [{
                    model: sequelize.models.Id,
                    as: 'from',
                    subQuery: false,
                    required: true,
                  }],
                }],
              }
            ],
          },
        ],
        order: [['slug', 'ASC']],
        offset,
        limit: config.maxArticlesInMemory,
      })
      if (articles.length === 0)
        break
      for (const article of articles) {
        if (log)
          console.log(article.slug)
        await article.rerender({ convertOptionsExtra, ignoreErrors })
      }
      offset += config.maxArticlesInMemory
    }
  }

  Article.prototype.getSlug = function() {
    return this.slug
  }

  /**
   * Calculate nested sets from Ref information update database with those values.
   *
   * @param {string} username
   */
  Article.updateNestedSets = async function(username, { transaction }={}) {
    const nestedSet = await Article.getNestedSetsFromRefs(username, { transaction })
    const vals = nestedSet.map(s => { return {
      slug: s.id.slice(ourbigbook.AT_MENTION_CHAR.length),
      nestedSetIndex: s.nestedSetIndex,
      nestedSetNextSibling: s.nestedSetNextSibling,
      depth: s.depth,
    }})
    return sequelize.transaction({ transaction }, async (transaction) => {
      for (const val of vals) {
        await sequelize.models.Article.update(
          {
            nestedSetIndex: val.nestedSetIndex,
            nestedSetNextSibling: val.nestedSetNextSibling,
            depth: val.depth,
          },
          {
            transaction,
            where: { slug: val.slug },
          },
        )
      }
    })
    // Would be nice, but doesn't work because of NOT NULL columns:
    // https://stackoverflow.com/questions/48816629/on-conflict-do-nothing-in-postgres-with-a-not-null-constraint
    //return Article.bulkCreate(
    //  vals,
    //  {
    //    updateOnDuplicate: [
    //      'nestedSetIndex',
    //      'nestedSetNextSibling',
    //    ]
    //  }
    //)
  }

  Article.slugTransform = slugTransform
  return Article
}
