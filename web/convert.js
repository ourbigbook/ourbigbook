const lodash = require('lodash')
const crypto = require('crypto');

const ourbigbook = require('ourbigbook')
const {
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqliteDbProvider,
} = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

const { ValidationError } = require('./api/lib')
const {
  commentIdPrefix,
  convertOptions,
  forbidMultiheaderMessage,
  maxArticleTitleSize,
  read_include_web
} = require('./front/config')
const { hasReachedMaxItemCount, modifyEditorInput } = require('./front/js')
const routes = require('./front/routes')

// Subset of convertArticle for usage in issues and comments.
// This is a much simpler procedure as it does not alter the File/Article database.
async function convert({
  author,
  bodySource,
  convertOptionsExtra,
  fakeUsernameDir,
  parentId,
  path,
  render,
  sequelize,
  splitHeaders,
  titleSource,
  transaction,
}) {
  const db_provider = new SqliteDbProvider(sequelize)
  const extra_returns = {};
  const source = modifyEditorInput(titleSource, bodySource).new
  let input_path_given
  if (path === undefined) {
    path = titleSource ? ourbigbook.title_to_id(titleSource) : 'asdf'
    input_path_given = false
  } else {
    path = path
    input_path_given = true
  }
  if (parentId) {
    const parentIdRow = await sequelize.models.Id.findOne({
      where: { idid: parentId },
    })
    if (!parentIdRow) {
      throw new ValidationError(`parentId did not match any known parent: "${parentId}"`)
    }
    let scope
    if (input_path_given) {
      scope = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    } else {
      const context = ourbigbook.convert_init_context()
      const parentH1Ast = ourbigbook.AstNode.fromJSON(parentIdRow.ast_json, context)
      parentH1Ast.id = parentIdRow.idid
      const parentScope = parentH1Ast.calculate_scope()
      // Inherit scope from parent. In particular, this forces every article by a
      // user to be scoped under @username due to this being recursive from the index page.
      scope = parentScope
    }
    input_path = `${scope}/${path}.${ourbigbook.OURBIGBOOK_EXT}`
  } else {
    let usernameDir
    if (fakeUsernameDir) {
      usernameDir = fakeUsernameDir
    } else {
      usernameDir = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    }
    // Index page. Hardcode input path.
    input_path = `${usernameDir}/${path}.${ourbigbook.OURBIGBOOK_EXT}`
  }
  await ourbigbook.convert(
    source,
    lodash.merge({
      db_provider,
      input_path,
      ourbigbook_json: {
        h: {
          splitDefault: false,
          splitDefaultNotToplevel: true,
        },
      },
      parent_id: parentId,
      read_include: read_include_web(async (idid) => (await sequelize.models.Id.count({ where: { idid }, transaction })) > 0),
      ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${author.username}`,
      render,
      split_headers: splitHeaders === undefined ? true : splitHeaders,
    }, convertOptions, convertOptionsExtra),
    extra_returns,
  )
  if (extra_returns.errors.length > 0) {
    const errsNoDupes = remove_duplicates_sorted_array(
      extra_returns.errors.map(e => e.toString()))
    throw new ValidationError(errsNoDupes)
  }
  return {
    db_provider,
    extra_returns,
    input_path,
    sha256: crypto.createHash('sha256').update(source).digest('hex'),
  }
}

// This does the type of stuff that OurBigBook CLI does for CLI
// around the conversion itself, i.e. setting up the database, saving output files
// but on the Web.
//
// This is how Articles should always be created and updated.
async function convertArticle({
  author,
  bodySource,
  enforceMaxArticles,
  forceNew,
  path,
  parentId,
  previousSiblingId,
  render,
  sequelize,
  titleSource,
  transaction,
}) {
  let articles, extra_returns
  if (enforceMaxArticles === undefined) {
    enforceMaxArticles = true
  }
  await sequelize.transaction({ transaction }, async (transaction) => {
    if (render === undefined) {
      render = true
    }
    let db_provider, input_path
    ;({ db_provider, extra_returns, input_path, sha256 } = await convert({
      author,
      bodySource,
      convertOptionsExtra: {
        forbid_multiheader: forbidMultiheaderMessage,
        // 1 to remove the @ from every single ID, but still keep the `username` prefix.
        // This is necessary so we can use the same h2 render for articles under a scope for both 
        // renderings inside and outside of the scope. With dynamic article tree on web, we cannot know if the
        // page will be visible from inside or outside the toplevel scope, so if we use a cut up version:
        // `my-scope/section-id` as just `section-id` from something outside of `my-scope`, then there could
        // be ambiguity with other headeres with ID `section-id`. We could keep multiple h2 renderings around
        // for different situations, but let's not muck around with that for now. This option will also remove
        // the @username prefix, which is implemented as a scope. This does have an advantage: we can use the same
        // rendering on topic pages, and in the future on collections, which require elements by different users
        // to show fine under a single page.
        fixedScopeRemoval: ourbigbook.AT_MENTION_CHAR.length,
        h_web_metadata: true,
        prefixNonIndexedIdsWithParentId: true,
      },
      forceNew,
      parentId,
      path,
      render,
      sequelize,
      titleSource,
      transaction,
    }))
    const toplevelId = extra_returns.context.header_tree.children[0].ast.id
    if (forceNew && await sequelize.models.File.findOne({ where: { path: input_path }, transaction })) {
      throw new ValidationError(`Article with this ID already exists: ${toplevelId}`)
    }
    await update_database_after_convert({
      authorId: author.id,
      bodySource,
      extra_returns,
      db_provider,
      sequelize,
      path: input_path,
      render,
      sha256,
      titleSource,
      transaction,
    })

    // Update nestedSetIndex and other things that can only be updated after the initial non-render pass.
    //
    // nestedSetIndex requires the initial non-render pass because it can only be calculated correctly
    //
    // Note however that nestedSetIndex is also calculated incrementally on the render pass, and as a result,
    // article instances returned by this function do not have the correct final value for it.
    if (
      render
    ) {
      const oldRef = await sequelize.models.Ref.findOne({
        where: {
          to_id: toplevelId,
          type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
        include: [
          {
            model: sequelize.models.Id,
            as: 'to',
            include: [
              {
                model: sequelize.models.File,
                include: [
                  {
                    model: sequelize.models.Article,
                    as: 'file',
                  }
                ],
              }
            ]
          },
          {
            model: sequelize.models.Id,
            as: 'from',
            include: [
              {
                model: sequelize.models.File,
                include: [
                  {
                    model: sequelize.models.Article,
                    as: 'file',
                  }
                ],
              }
            ]
          },
        ],
        transaction,
      })
      const idPrefix = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
      let refWhere = { to_id: previousSiblingId }
      if (parentId !== undefined) {
        refWhere.from_id = parentId
      }
      if (toplevelId === idPrefix) {
        // Index conversion.
        if (parentId !== undefined) {
          // As of writing, this will be caught and thrown on the ancestors part of conversion:
          // as changing the Index to anything else always leads to infinite loop.
          throw new ValidationError(`cannot give parentId for index conversion, received "${toplevelId}"`)
        }
      } else {
        // Non-index conversion.
        if (parentId === undefined) {
          if (oldRef) {
            // Happens when updating a page.
            parentId = oldRef.from.idid
          } else if (previousSiblingId === undefined) {
            throw new ValidationError(`missing parentId argument is mandatory for new articles and article ID "${toplevelId}" does not exist yet so it is new`)
          }
        }
      }
      let parentIdRow, previousSiblingRef
      ;[parentIdRow, previousSiblingRef] = await Promise.all([
        parentId !== undefined
          ? sequelize.models.Id.findOne({
              where: {
                idid: parentId
              },
              include: [
                {
                  model: sequelize.models.File,
                  include: [
                    {
                      model: sequelize.models.Article,
                      as: 'file',
                    }
                  ],
                }
              ],
              transaction
            })
          : null,
        previousSiblingId === undefined
          ? null
          : sequelize.models.Ref.findOne({
              where: refWhere,
              include: [
                {
                  model: sequelize.models.Id,
                  as: 'to',
                  where: {
                    macro_name: ourbigbook.Macro.HEADER_MACRO_NAME,
                  },
                  include: [
                    {
                      model: sequelize.models.File,
                      include: [
                        {
                          model: sequelize.models.Article,
                          as: 'file',
                        }
                      ],
                    }
                  ],
                },
                {
                  model: sequelize.models.Id,
                  as: 'from',
                  include: [
                    {
                      model: sequelize.models.File,
                      include: [
                        {
                          model: sequelize.models.Article,
                          as: 'file',
                        }
                      ],
                    }
                  ],
                },
              ],
              type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              transaction,
            })
      ])

      // For Nested Set calculations.
      let oldArticle
      let oldParentArticle
      let parentArticle
      let previousSiblingArticle
      // Where we are going to place the article.
      let nestedSetIndex = 0
      let nestedSetNextSibling = 1
      let oldDepth
      let newDepth = 0
      // By how much we are moving an existing article to its new position.
      // We calculate it in terms of deltas because all descendants have to be moved by that as well.
      let oldNestedSetIndex
      let oldNestedSetNextSibling
      let oldParentNestedSetIndex
      let nestedSetSize
      if (previousSiblingRef) {
        previousSiblingArticle = previousSiblingRef.to.File.file[0]
        nestedSetIndex = previousSiblingArticle.nestedSetNextSibling
        // Deduce parent from given sibling.
        parentIdRow = previousSiblingRef.from
        parentId = parentIdRow.idid
        parentArticle = parentIdRow.File.file[0]
      }
      if (parentIdRow) {
        if (!previousSiblingRef) {
          parentArticle = parentIdRow.File.file[0]
        }
      }
      if (parentArticle) {
        newDepth = parentArticle.depth + 1
        if (!previousSiblingRef) {
          nestedSetIndex = parentArticle.nestedSetIndex + 1
        }
      }
      if (oldRef) {
        oldArticle = oldRef.to.File.file[0]
        oldNestedSetIndex = oldArticle.nestedSetIndex
        oldNestedSetNextSibling = oldArticle.nestedSetNextSibling
        nestedSetSize = oldArticle.nestedSetNextSibling - oldArticle.nestedSetIndex
        oldParentArticle = oldRef.from.File.file[0]
        oldParentNestedSetIndex = oldParentArticle.nestedSetIndex
        oldDepth = oldArticle.depth
      } else {
        nestedSetSize = 1
      }
      nestedSetNextSibling = nestedSetIndex + nestedSetSize

      if (
        oldNestedSetIndex !== undefined &&
        nestedSetIndex > oldNestedSetIndex &&
        nestedSetIndex < oldNestedSetNextSibling
      ) {
        throw new ValidationError(`the parent choice "${parentId}" would create an infinite loop`)
      }
      if (!previousSiblingRef && previousSiblingId) {
        throw new ValidationError(`previousSiblingId "${previousSiblingId}" does not exist, is not a header or is not a child of parentId "${parentId}"`)
      }

      // Where to insert the new header.
      let to_id_index
      if (previousSiblingRef) {
        to_id_index = previousSiblingRef.to_id_index + 1
      } else {
        to_id_index = 0
      }

      // Article exists and we are moving it to a new position.
      const articleMoved = (
        oldRef &&
        (
          oldRef.from_id !== parentId ||
          oldRef.to_id_index !== to_id_index
        )
      )
      //const whereAuthorInclude = {
      //  model: sequelize.models.File,
      //  as: 'file',
      //  where: {
      //    authorId: author.id,
      //  },
      //}
      if (
        // Fails only for the index page which has no parent.
        parentId !== undefined
      ) {
        if (!parentIdRow) {
          throw new ValidationError(`parentId does not exist: "${parentId}"`)
        }
        if (parentIdRow.macro_name !== ourbigbook.Macro.HEADER_MACRO_NAME) {
          throw new ValidationError(`parentId is not a header: "${parentI}"`)
        }
        // Create space on the tree structure and insert the article there.
        if (articleMoved) {
          await Promise.all([
            // Decrement sibling indexes after point we are removing from.
            sequelize.models.Ref.decrement('to_id_index', {
              where: {
                from_id: oldRef.from_id,
                to_id_index: { [sequelize.Sequelize.Op.gt]: oldRef.to_id_index },
                type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              },
              transaction,
            }),
          ])
        }
        if (
          articleMoved ||
          !oldRef
        ) {
          let ancestorUpdateIndexWhere
          //if (previousSiblingRef && parentArticle) {
          //  ancestorUpdateIndexWhere = { [sequelize.Sequelize.Op.lte]: parentArticle.nestedSetIndex }
          //} else {
          //  ancestorUpdateIndexWhere = { [sequelize.Sequelize.Op.lt]: nestedSetIndex }
          //}
          if (previousSiblingRef && parentArticle) {
            ancestorUpdateIndexWhere = `<= ${parentArticle.nestedSetIndex}`
          } else {
            ancestorUpdateIndexWhere = `< ${nestedSetIndex}`
          }
          // Create space to insert the article at.
          await Promise.all([
            // Increment sibling indexes after point we are inserting from.
            sequelize.models.Ref.increment('to_id_index', {
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
            await sequelize.query(`
UPDATE "Article" SET
  "nestedSetIndex" = "nestedSetIndex" + :nestedSetSize,
  "nestedSetNextSibling" = "nestedSetNextSibling" + :nestedSetSize
WHERE
  "nestedSetIndex" >= :nestedSetIndex AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :authorUsername
  )
`,
              {
                transaction,
                replacements: {
                  authorUsername: author.username,
                  nestedSetIndex,
                  nestedSetSize,
                },
              },
            ),
            // This is the non raw version that works except for the user selection from the JOIN.
            //sequelize.models.Article.update(
            //  {
            //    nestedSetIndex: sequelize.where(sequelize.col('nestedSetIndex'), '+', nestedSetSize),
            //    nestedSetNextSibling: sequelize.where(sequelize.col('nestedSetNextSibling'), '+', nestedSetSize),
            //  },
            //  {
            //    //where: {
            //    //  nestedSetIndex: { [sequelize.Sequelize.Op.gte]: nestedSetIndex },
            //    //},
            //    subQuery: false,
            //    include: [whereAuthorInclude],
            //    sideEffects: false,
            //    transaction,
            //  }
            //),

            // Increase nested set next sibling of ancestors. Their index is unchanged.
            //sequelize.models.Article.increment('nestedSetNextSibling', {
            //  where: {
            //    nestedSetIndex: ancestorUpdateIndexWhere,
            //    nestedSetNextSibling: { [sequelize.Sequelize.Op.gte]: nestedSetIndex },
            //  },
            //  subQuery: false,
            //  include: [whereAuthorInclude],
            //  by: nestedSetSize,
            //  transaction,
            //}),
            await sequelize.query(`
UPDATE "Article" SET
  "nestedSetNextSibling" = "nestedSetNextSibling" + :nestedSetSize
WHERE
  "nestedSetIndex" ${ancestorUpdateIndexWhere} AND
  "nestedSetNextSibling" >= :nestedSetIndex AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :authorUsername
  )
`,
              {
                transaction,
                replacements: {
                  authorUsername: author.username,
                  nestedSetIndex,
                  nestedSetSize,
                },
              },
            ),
          ])
          if (nestedSetIndex < oldNestedSetIndex) {
            // We just opened up space behind the subtree that we are about to move.
            // So the old tree have moved up.
            oldNestedSetIndex += nestedSetSize
            oldNestedSetNextSibling += nestedSetSize
          }
          if (nestedSetIndex <= oldParentNestedSetIndex) {
            oldParentNestedSetIndex += nestedSetSize
          }
        }

        // Insert article in the space created above.
        const newRefAttrs = {
          type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          to_id: toplevelId,
          from_id: parentId,
          inflected: false,
          to_id_index,
        }
        if (oldRef) {
          if (articleMoved) {
            await sequelize.models.Ref.update(
              newRefAttrs,
              {
                where: {
                  to_id: toplevelId,
                  type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                },
                transaction,
              },
            )
          }
        } else {
          await sequelize.models.Ref.create(
            newRefAttrs,
            { transaction }
          )
        }
      }
      const [check_db_errors, file] = await Promise.all([
        ourbigbook_nodejs_webpack_safe.check_db(
          sequelize,
          [input_path],
          transaction
        ),
        sequelize.models.File.findOne({ where: { path: input_path }, transaction }),
      ])
      if (check_db_errors.length > 0) {
        throw new ValidationError(check_db_errors)
      }
      const articleArgs = []
      for (const outpath in extra_returns.rendered_outputs) {
        const rendered_output = extra_returns.rendered_outputs[outpath]
        const renderFull = rendered_output.full
        articleArgs.push({
          depth: newDepth,
          fileId: file.id,
          h1Render: renderFull.substring(0, rendered_output.h1RenderLength),
          h2Render: rendered_output.h2Render,
          render: renderFull.substring(rendered_output.h1RenderLength),
          slug: outpath.slice(ourbigbook.AT_MENTION_CHAR.length, -ourbigbook.HTML_EXT.length - 1),
          titleRender: rendered_output.title,
          titleSource: rendered_output.titleSource,
          titleSourceLine:
            rendered_output.titleSourceLocation
              ? rendered_output.titleSourceLocation.line
              // Can happen if user tries to add h1 to a document. TODO investigate further why.
              : undefined,
          topicId: outpath.slice(
            ourbigbook.AT_MENTION_CHAR.length + author.username.length + 1,
            -ourbigbook.HTML_EXT.length - 1
          ),
        })
        if (titleSource.length > maxArticleTitleSize) {
          throw new ValidationError(`Title source too long: ${titleSource.length} bytes, maximum: ${maxArticleTitleSize} bytes, title: ${titleSource}`)
        }
      }
      // Due to this limited setup, nested set ordering currently only works on one article per source setups.
      const articleArgs0 = articleArgs[0]
      articleArgs0.nestedSetIndex = nestedSetIndex
      articleArgs0.nestedSetNextSibling = nestedSetNextSibling

      await sequelize.models.Article.bulkCreate(
        articleArgs,
        {
          updateOnDuplicate: [
            'h1Render',
            'h2Render',
            'titleRender',
            'titleSource',
            'titleSourceLine',
            'render',
            'topicId',
            'updatedAt',
            // We intentionally skip:
            // * depth
            // * nestedSetInde
            // * nestedSetNextSibling
            // as those will be updated in bulk soon afterwards together with all descendants.
          ],
          transaction,
          // Trying this to validate mas titleSource length here leads to another error.
          // validate: true,
          // individualHooks: true,
        }
      )
      let articleCountByLoggedInUser
      let nestedSetDelta = nestedSetIndex - oldNestedSetIndex
      let depthDelta = newDepth - oldDepth
      ;[articleCountByLoggedInUser, articles, _] = await Promise.all([
        sequelize.models.File.count({ where: { authorId: author.id }, transaction }),
        // Find here because upsert not yet supported in SQLite, so above updateOnDuplicate wouldn't work.
        // https://stackoverflow.com/questions/29063232/how-to-get-the-id-of-an-inserted-or-updated-record-in-sequelize-upsert
        sequelize.models.Article.getArticles({
          count: false,
          order: 'slug',
          orderAscDesc: 'ASC',
          sequelize,
          slug: articleArgs.map(arg => arg.slug),
          transaction,
        }),
        articleMoved
          // Move all descendants of an existing article to their new position.
          //? sequelize.models.Article.update(
          //    {
          //      nestedSetIndex: sequelize.where(sequelize.col('nestedSetIndex'), '+', nestedSetDelta),
          //      nestedSetNextSibling: sequelize.where(sequelize.col('nestedSetNextSibling'), '+', nestedSetDelta),
          //      depth: sequelize.where(sequelize.col('depth'), '+', depthDelta),
          //    },
          //    {
          //      where: {
          //        nestedSetIndex: {
          //          [sequelize.Sequelize.Op.gte]: oldNestedSetIndex,
          //          [sequelize.Sequelize.Op.lt]: oldNestedSetNextSibling,
          //        },
          //      },
          //      subQuery: false,
          //      include: [whereAuthorInclude],
          //      sideEffects: false,
          //      transaction,
          //    }
          //  )
          ? await sequelize.query(`
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
    WHERE "User"."username" = :authorUsername
  )
`,
              {
                transaction,
                replacements: {
                  authorUsername: author.username,
                  depthDelta,
                  nestedSetDelta,
                  nestedSetIndex,
                  nestedSetSize,
                  oldNestedSetIndex,
                  oldNestedSetNextSibling,
                },
              },
            )
          : null
        ,
      ])
      if (enforceMaxArticles) {
        const err = hasReachedMaxItemCount(author, articleCountByLoggedInUser - 1, 'articles')
        if (err) { throw new ValidationError(err, 403) }
      }
      await Promise.all([
        sequelize.models.Topic.updateTopics(articles, { newArticles: true, transaction }),
        articleMoved
          // Close up nested set space from which we moved the subtree out.
          ? Promise.all([
            // Reduce nested set index and next sibling of all nodes that come after.
            //sequelize.models.Article.update(
            //  {
            //    nestedSetIndex: sequelize.where(sequelize.col('nestedSetIndex'), '-', nestedSetSize),
            //    nestedSetNextSibling: sequelize.where(sequelize.col('nestedSetNextSibling'), '-', nestedSetSize),
            //  },
            //  {
            //    where: {
            //      nestedSetIndex: { [sequelize.Sequelize.Op.gt]: oldNestedSetIndex },
            //    },
            //    sideEffects: false,
            //    transaction,
            //    subQuery: false,
            //    include: [whereAuthorInclude],
            //  },
            //),
            sequelize.query(`
UPDATE "Article" SET
  "nestedSetIndex" = "nestedSetIndex" - :nestedSetSize,
  "nestedSetNextSibling" = "nestedSetNextSibling" - :nestedSetSize
WHERE
  "nestedSetIndex" > :oldNestedSetIndex AND
  "id" IN (
    SELECT "Article"."id" from "Article"
    INNER JOIN "File"
      ON "Article"."fileId" = "File"."id"
    INNER JOIN "User"
      ON "File"."authorId" = "User"."id"
    WHERE "User"."username" = :authorUsername
  )
`,
              {
                transaction,
                replacements: {
                  authorUsername: author.username,
                  depthDelta,
                  nestedSetIndex,
                  nestedSetSize,
                  oldNestedSetIndex,
                  oldNestedSetNextSibling,
                },
              },
            ),
            parentArticle
              ? // Reduce nested set next sibling of ancestors. Index is unchanged.
                sequelize.models.Article.decrement('nestedSetNextSibling', {
                  where: {
                    nestedSetIndex: { [sequelize.Sequelize.Op.lte]: oldParentNestedSetIndex },
                    nestedSetNextSibling: { [sequelize.Sequelize.Op.gte]: oldNestedSetIndex },
                  },
                  by: nestedSetSize,
                  transaction,
                })
              : null
            ,
          ])
          : null
        ])
    } else {
      articles = []
    }
  })
  return { articles, extra_returns }
}

async function convertComment({ issue, number, sequelize, source, user }) {
  const { extra_returns } = await convert({
    author: user,
    bodySource: source,
    convertOptionsExtra: {
      fixedScopeRemoval: 0,
      tocIdPrefix: `${commentIdPrefix}${number}-`,
    },
    fakeUsernameDir: `@${user.username}/${commentIdPrefix}${number}`,
    render: true,
    sequelize,
    splitHeaders: false,
    titleSource: undefined,
  })
  const outpath = Object.keys(extra_returns.rendered_outputs)[0]
  return sequelize.models.Comment.create({
    issueId: issue.id,
    number,
    authorId: user.id,
    source,
    render: extra_returns.rendered_outputs[outpath].full,
  })
}

async function convertIssue({ article, bodySource, issue, number, sequelize, titleSource, user }) {
  if (issue) {
    if (bodySource === undefined) {
      bodySource = issue.bodySource
    } else {
      issue.bodySource = bodySource
    }
    if (titleSource === undefined) {
      titleSource = issue.titleSource
    } else {
      issue.titleSource = titleSource
    }
  }
  if (titleSource.length > maxArticleTitleSize) {
    //throw new ValidationError(`Title source too long: ${titleSource.length} bytes, maximum: ${maxArticleTitleSize} bytes, title: ${titleSource}`)
  }
  // We use routes here to achieve a path that matches the exact length of what the issue will render to,
  // so that the internal cross references will render with the correct number of ../
  const { extra_returns } = await convert({
    author: user,
    bodySource,
    convertOptionsExtra: {
      fixedScopeRemoval: 0,
      h_web_metadata: true,
    },
    fakeUsernameDir: `@${user.username}/_issue-${article.slug}/${number}`,
    render: true,
    sequelize,
    splitHeaders: false,
    titleSource,
  })
  const outpath = Object.keys(extra_returns.rendered_outputs)[0]
  const renders = extra_returns.rendered_outputs[outpath]
  const titleRender = renders.title
  const render = renders.full
  if (issue === undefined) {
    return sequelize.models.Issue.create({
      articleId: article.id,
      authorId: user.id,
      titleSource,
      bodySource,
      titleRender,
      render,
      number,
    })
  } else {
    issue.titleRender = titleRender
    issue.render = render
    return issue.save()
  }
}

module.exports = {
  convert,
  convertArticle,
  convertComment,
  convertIssue,
}
