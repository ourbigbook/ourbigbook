const lodash = require('lodash')

const ourbigbook = require('ourbigbook')
const {
  fetch_ancestors,
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqlDbProvider,
} = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
const { articleHash } = require('ourbigbook/web_api')

const { ValidationError } = require('./api/lib')
const {
  commentIdPrefix,
  convertOptions,
  forbidMultiheaderMessage,
  hideArticleDatesDate,
  maxArticleTitleSize,
  read_include_web
} = require('./front/config')
const { hasReachedMaxItemCount, idToSlug, slugToId } = require('./front/js')

function getConvertOpts({
  authorUsername,
  extraOptions={},
  input_path,
  sequelize,
  parentId,
  render,
  splitHeaders,
  type,
  transaction,
}) {
  const db_provider = new SqlDbProvider(sequelize)
  return {
    db_provider,
    convertOptions: lodash.merge(
      {
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
        ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${authorUsername}`,
        render,
        split_headers: splitHeaders === undefined ? true : splitHeaders,
        h_web_ancestors: type === 'article',
      },
      extraOptions,
      convertOptions
    )
  }
}

// Subset of convertArticle for usage in issues and comments. Used by convertArticle as well.
// This is a much simpler procedure as it does not alter the File/Article database.
async function convert({
  author,
  bodySource,
  convertOptionsExtra,
  fakeUsernameDir,
  parentId,
  path,
  perf,
  render,
  sequelize,
  splitHeaders,
  titleSource,
  transaction,
  type,
}) {
  let t0
  if (perf) {
    t0 = performance.now();
    console.error('perf: convert.start');
  }
  const extra_returns = {};
  const source = ourbigbook.modifyEditorInput(titleSource, bodySource).new
  let input_path
  let input_path_given
  if (path === undefined) {
    if (titleSource === undefined) {
      // titleSource can be undefined for comments
      path = 'comment-path-placeholder'
    } else {
      // Do one pre-conversion to determine the file path.
      // All we need from it is the toplevel header.
      // E.g. this finds the correct path from {id= and {disambiguate=
      // https://github.com/ourbigbook/ourbigbook/issues/304
      const extra_returns = {}
      const { convertOptions } = getConvertOpts({
        authorUsername: author.username,
        extraOptions: {
          h1Only: true,
        },
        input_path: undefined,
        parentId,
        render: false,
        sequelize,
        splitHeaders: false,
        transaction,
        type,
      })
      await ourbigbook.convert(
        source,
        lodash.merge(convertOptions, convertOptionsExtra),
        extra_returns,
      )
      path = extra_returns.context.header_tree.children[0].ast.id
    }
    input_path_given = false
  } else {
    input_path_given = true
  }
  if (parentId) {
    let parentIdRow = await sequelize.models.Id.findOne({
      where: { idid: parentId },
      include: [
        {
          model: sequelize.models.Ref,
          as: 'from',
          required: false,
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
          },
          include: [{
            model: sequelize.models.Id,
            as: 'to',
          }]
        }
      ]
    })
    if (!parentIdRow) {
      throw new ValidationError(`parentId did not match any known parent: "${parentId}"`)
    }
    {
      const from = parentIdRow.from
      if (from.length) {
        // This is a synonym. Use the non-synonym target instead.
        parentIdRow = from[0].to
        parentId = parentIdRow.idid
      }
    }
    let scope
    if (input_path_given) {
      scope = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    } else {
      const context = ourbigbook.convertInitContext()
      const parentH1Ast = ourbigbook.AstNode.fromJSON(parentIdRow.ast_json, context)
      parentH1Ast.id = parentIdRow.idid
      const parentScope = parentH1Ast.calculate_scope()
      // Inherit scope from parent. In particular, this forces every article by a
      // user to be scoped under @username due to this being recursive from the index page.
      scope = parentScope
    }
    input_path = scopeIdToPath(scope, path)
  } else {
    let usernameDir
    if (fakeUsernameDir) {
      usernameDir = fakeUsernameDir
    } else {
      usernameDir = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    }
    // Index page. Hardcode input path.
    input_path = scopeIdToPath(usernameDir, path)
  }
  const { db_provider, convertOptions } = getConvertOpts({
    authorUsername: author.username,
    input_path,
    parentId,
    render,
    sequelize,
    splitHeaders,
    transaction,
    type,
  })
  await ourbigbook.convert(
    source,
    lodash.merge(convertOptions, convertOptionsExtra),
    extra_returns,
  )
  if (perf) {
    console.error(`perf: convert.after_convert: ${performance.now() - t0} ms`);
  }
  if (extra_returns.errors.length > 0) {
    const errsNoDupes = remove_duplicates_sorted_array(
      extra_returns.errors.map(e => e.toString()))
    throw new ValidationError(errsNoDupes, 422, { info: { source } })
  }
  if (perf) {
    console.error(`perf: convert.finish: ${performance.now() - t0} ms`);
  }
  return {
    db_provider,
    extra_returns,
    input_path,
    // Potentially updated to point to the target synonym.
    // Caller should use this from then on.
    parentId,
    source,
  }
}

/*
 * Create or update an article.
 *
 * This does the type of stuff that OurBigBook CLI does for CLI
 * around the conversion itself, i.e. setting up the database, saving output files
 * but on the Web.
 *
 * This is how Articles should always be created and updated.
 *
 * @param {string} parentId - Required for h2Render to render correctly. Otherwise it looks like an h1Render.
 * @param {boolean} updateTree - If false, don't change the position of the article in the tree.
 *   This also prevents the creation of new articles, only content updates are allowed in that case.
 *   This option can massively save time by skipping unnecessary nested set tree updates.
 */
async function convertArticle({
  author,
  bodySource,
  convertOptionsExtra,
  enforceMaxArticles,
  forceNew,
  list,
  path,
  perf,
  parentId,
  previousSiblingId,
  render,
  sequelize,
  titleSource,
  transaction,
  updateNestedSetIndex,
  updateHash,
  updateTree,
}) {
  if (updateNestedSetIndex === undefined) {
    updateNestedSetIndex = true
  }
  if (updateHash === undefined) {
    updateHash = true
  }
  if (updateTree === undefined) {
    updateTree = true
  }
  let t0
  if (perf) {
    t0 = performance.now();
    console.error(`perf: convertArticle.start titleSource="${titleSource}"`);
  }
  let articles, extra_returns
  if (enforceMaxArticles === undefined) {
    enforceMaxArticles = true
  }
  if (convertOptionsExtra === undefined) {
    convertOptionsExtra = {}
  }
  let nestedSetNeedsUpdate = true
  await sequelize.transaction({ transaction }, async (transaction) => {
    if (render === undefined) {
      render = true
    }
    let db_provider, input_path
    ;({ db_provider, extra_returns, input_path, parentId, source } = await convert({
      author,
      bodySource,
      convertOptionsExtra: Object.assign({
        forbid_multiheader: forbidMultiheaderMessage,
        // 1 to remove the @ from every single ID, but still keep the `username` prefix.
        // This is necessary so we can use the same h2 render for articles under a scope for both
        // renderings inside and outside of the scope. With dynamic article tree on web, we cannot know if the
        // page will be visible from inside or outside the toplevel scope, so if we use a cut up version:
        // `my-scope/section-id` as just `section-id` from something outside of `my-scope`, then there could
        // be ambiguity with other headers with ID `section-id`. We could keep multiple h2 renderings around
        // for different situations, but let's not muck around with that for now. This option will also remove
        // the @username prefix, which is implemented as a scope. This does have an advantage: we can use the same
        // rendering on topic pages, and in the future on collections, which require elements by different users
        // to show fine under a single page.
        fixedScopeRemoval: ourbigbook.AT_MENTION_CHAR.length,
        h_web_metadata: true,
        prefixNonIndexedIdsWithParentId: true,
      }, convertOptionsExtra),
      forceNew,
      parentId,
      path,
      perf,
      render,
      sequelize,
      titleSource,
      transaction,
      type: 'article',
    }))
    const toplevelAst = extra_returns.context.header_tree.children[0].ast
    const toplevelId = toplevelAst.id
    if (toplevelId !== toplevelId.toLowerCase() && !toplevelAst.validation_output.file.given) {
      throw new ValidationError(`Article ID cannot contain uppercase characters: "${toplevelId}"`)
    }
    if (forceNew && (await sequelize.models.File.findOne({ where: { path: input_path }, transaction }))) {
      throw new ValidationError(`Article with this ID already exists: ${toplevelId}`)
    }

    // Synonym handling part 1
    const synonymHeadersArr = Array.from(extra_returns.context.synonym_headers)
    const synonymIds = synonymHeadersArr.map(h => h.id)
    const synonymArticles = await sequelize.models.Article.getArticles({
      count: false,
      includeParentAndPreviousSibling: true,
      sequelize,
      slug: synonymIds.map(id => idToSlug(id)),
      transaction,
    })
    if (synonymIds.length) {
      // Clear IDs of the synonyms.
      await db_provider.clear(
        synonymArticles.map(a => a.file.path),
        transaction,
      )
    }

    // Determine the correct parentId from parentId and previousSiblingId
    // It is kind of ugly that we do this after convert, meaning that convert()
    // gets the wrong parentId as input. But it doesn't seem to matter and there were some
    // dependency issues linked to the fact that toplevelId is calculated during convert()
    // as it needs access to the h1 content. So let's keep this after for now.
    const idPrefix = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
    const isIndex = toplevelId === idPrefix
    let newParentId = parentId
    let newParentArticle
    let refWhere = {
      to_id: previousSiblingId,
      type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
    }
    if (newParentId !== undefined) {
      refWhere.from_id = newParentId
    }
    const oldRef = await sequelize.models.Ref.findOne({
      where: {
        to_id: [toplevelId],
        type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
      },
      include: [
        {
          model: sequelize.models.Id,
          as: 'to',
          include: [
            {
              model: sequelize.models.File,
              as: 'toplevelId',
              include: [
                {
                  model: sequelize.models.Article,
                  as: 'articles',
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
              as: 'toplevelId',
              include: [
                {
                  model: sequelize.models.Article,
                  as: 'articles',
                }
              ],
            }
          ]
        },
      ],
      transaction,
    })
    if (!isIndex) {
      // Non-index conversion.
      if (newParentId === undefined) {
        if (oldRef) {
          // Happens when updating a page.
          newParentId = oldRef.from.idid
        } else if (previousSiblingId === undefined) {
          throw new ValidationError(`missing parentId argument is mandatory for new articles and article ID "${toplevelId}" does not exist yet so it is new`)
        }
      }
    }
    let parentIdRow
    let previousSiblingRef
    ;[parentIdRow, previousSiblingRef] = await Promise.all([
      newParentId === undefined
        ? null
        : sequelize.models.Id.findOne({
            where: { idid: newParentId },
            include: [
              {
                model: sequelize.models.File,
                as: 'toplevelId',
                include: [
                  {
                    model: sequelize.models.Article,
                    as: 'articles',
                  }
                ],
              },
            ],
            transaction
          })
      ,
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
                    as: 'toplevelId',
                    include: [
                      {
                        model: sequelize.models.Article,
                        as: 'articles',
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
                    as: 'toplevelId',
                    include: [
                      {
                        model: sequelize.models.Article,
                        as: 'articles',
                      }
                    ],
                  }
                ],
              },
            ],
            transaction,
          })
    ])
    if (previousSiblingRef) {
      // Deduce parent from given sibling.
      parentIdRow = previousSiblingRef.from
      newParentId = parentIdRow.idid
      newParentArticle = parentIdRow.toplevelId.articles[0]
    }

    // Error checking on parentId and previousSiblingId
    if (parentId && !parentIdRow) {
      throw new ValidationError(`parentId does not exist: "${newParentId}"`)
    }
    if (parentIdRow && parentIdRow.macro_name !== ourbigbook.Macro.HEADER_MACRO_NAME) {
      throw new ValidationError(`parentId is not a header: "${newParentId}"`)
    }
    // Index conversion check.
    if (isIndex && parentId !== undefined) {
      // As of writing, this will be caught and thrown on the ancestors part of conversion:
      // as changing the Index to anything else always leads to infinite loop.
      throw new ValidationError(`cannot give parentId for index conversion, received "${toplevelId}"`)
    }
    if (previousSiblingId && !previousSiblingRef) {
      throw new ValidationError(`previousSiblingId "${previousSiblingId}" does not exist, is not a header or is not a child of parentId "${newParentId}"`)
    }
    if (newParentId) {
      const ancestors = await fetch_ancestors(sequelize, newParentId, { onlyIncludeId: toplevelId, stopAt: toplevelId, transaction })
      if (ancestors.length) {
        throw new ValidationError(`parentId="${toplevelId}" would lead to infinite parent loop"`)
      }
    }

    const update_database_after_convert_arg = {
      authorId: author.id,
      bodySource,
      extra_returns,
      db_provider,
      sequelize,
      synonymHeaderPaths: Array.from(extra_returns.context.synonym_headers).map(h => `${h.id}.${ourbigbook.OURBIGBOOK_EXT}`),
      path: input_path,
      render,
      titleSource,
      transaction,
      updateHash,
    }
    if (updateHash) {
      update_database_after_convert_arg.hash = articleHash({ list, parentId, previousSiblingId, source })
    }
    const { file: newFile } = await update_database_after_convert(update_database_after_convert_arg)

    // Update nestedSetIndex and other things that can only be updated after the initial non-render pass.
    //
    // nestedSetIndex requires the initial non-render pass because it can only be calculated correctly
    //
    // Note however that nestedSetIndex is also calculated incrementally on the render pass, and as a result,
    // article instances returned by this function do not have the correct final value for it.
    if (render) {
      let nestedSetSize
      let newDepth = 0
      let newNestedSetIndex = 0
      let newNestedSetIndexParent
      let newNestedSetNextSibling = 1
      let new_to_id_index
      let oldArticle
      let oldDepth
      let oldNestedSetIndex
      let oldNestedSetIndexParent
      let oldNestedSetNextSibling
      let oldParentArticle
      let oldParentId
      let old_to_id_index

      if (previousSiblingRef) {
        newNestedSetIndex = previousSiblingRef.to.toplevelId.articles[0].nestedSetNextSibling
      }
      if (parentIdRow) {
        if (!previousSiblingRef) {
          newParentArticle = parentIdRow.toplevelId.articles[0]
        }
      }
      if (newParentArticle) {
        newDepth = newParentArticle.depth + 1
        if (!previousSiblingRef) {
          newNestedSetIndex = newParentArticle.nestedSetIndex + 1
        }
        newNestedSetIndexParent = newParentArticle.nestedSetIndex
      }
      if (oldRef) {
        oldArticle = oldRef.to.toplevelId.articles[0]
        oldNestedSetIndex = oldArticle.nestedSetIndex
        oldNestedSetNextSibling = oldArticle.nestedSetNextSibling
        nestedSetSize = oldArticle.nestedSetNextSibling - oldArticle.nestedSetIndex
        oldParentArticle = oldRef.from.toplevelId.articles[0]
        oldParentId = oldRef.from_id
        old_to_id_index = oldRef.to_id_index,
        oldNestedSetIndexParent = oldParentArticle.nestedSetIndex
        oldDepth = oldArticle.depth
      } else {
        nestedSetSize = 1
      }
      newNestedSetNextSibling = newNestedSetIndex + nestedSetSize
      if (isIndex) {
        // It would be better to handle this by oldArticle to the old article.
        // But we don't have it in this case because there is no oldRef. So let's fake it until things blow up somehow.
        oldNestedSetIndex = newNestedSetIndex
        oldNestedSetNextSibling = newNestedSetNextSibling
        oldDepth = newDepth
      }
      if (previousSiblingRef) {
        new_to_id_index = previousSiblingRef.to_id_index + 1
      } else {
        new_to_id_index = 0
      }
      nestedSetNeedsUpdate = !updateNestedSetIndex && (newParentId !== oldParentId || new_to_id_index !== old_to_id_index)
      if (nestedSetNeedsUpdate) {
        author.update({ nestedSetNeedsUpdate: true })
      }

      //const whereAuthorInclude = {
      //  model: sequelize.models.File,
      //  as: 'file',
      //  where: {
      //    authorId: author.id,
      //  },
      //}
      if (
        // Fails only for the index page which has no parent.
        newParentId !== undefined
      ) {
        if (!oldRef && updateTree) {
          // If the article is new, create space to insert it there.
          // For the moving of existing articles however, we leave the space opening up to the Article.treeMoveRangeTo function instead.
          await sequelize.models.Article.treeOpenSpace({
            parentNestedSetIndex: newNestedSetIndexParent,
            perf,
            nestedSetIndex: newNestedSetIndex,
            parentId: newParentId,
            shiftNestedSetBy: nestedSetSize,
            shiftRefBy: 1,
            to_id_index: new_to_id_index,
            transaction,
            updateNestedSetIndex,
            username: author.username,
          })
          if (newNestedSetIndex <= oldNestedSetIndexParent) {
            oldNestedSetIndexParent += nestedSetSize
          }
          // Set the article of the parent. The previously existing ref, if there was one,
          // has already been necessarily removed during update_database_after_convert.
          await sequelize.models.Ref.create(
            {
              type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              to_id: toplevelId,
              from_id: newParentId,
              inflected: false,
              to_id_index: new_to_id_index,
              defined_at: null,
            },
            { transaction }
          )
        }
      }

      // Actual rendering.
      const [check_db_errors, file] = await Promise.all([
        ourbigbook_nodejs_webpack_safe.check_db(
          sequelize,
          [input_path],
          {
            web: true,
            perf,
            transaction,
          },
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
        const topicId = outpath.slice(
          ourbigbook.AT_MENTION_CHAR.length + author.username.length + 1,
          -ourbigbook.HTML_EXT.length - 1
        )
        const articleArg = {
          authorId: author.id,
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
          topicId,
        }
        if (list !== undefined) {
          articleArg.list = list
        }
        if (updateNestedSetIndex) {
          articleArg.depth = newDepth
        } else {
          articleArg.depth = oldDepth
        }
        if (author.hideArticleDates) {
          articleArg.createdAt = hideArticleDatesDate
          articleArg.updatedAt = hideArticleDatesDate
        }
        articleArgs.push(articleArg)
        if (titleSource.length > maxArticleTitleSize) {
          throw new ValidationError(`Title source too long: ${titleSource.length} bytes, maximum: ${maxArticleTitleSize} bytes, title: ${titleSource}`)
        }
      }
      const articleArgs0 = articleArgs[0]
      if (updateNestedSetIndex) {
        // Due to this limited setup, nested set ordering currently only works on one article per source setups.
        // https://docs.ourbigbook.com/todo#web-create-multiple-headers
        articleArgs0.nestedSetIndex = newNestedSetIndex
        articleArgs0.nestedSetNextSibling = newNestedSetNextSibling
      } else {
        articleArgs0.nestedSetIndex = oldNestedSetIndex
        articleArgs0.nestedSetNextSibling = oldNestedSetNextSibling
      }

      const updateOnDuplicate = [
        'h1Render',
        'h2Render',
        'titleRender',
        'titleSource',
        'titleSourceLine',
        'render',
        'topicId',
        'updatedAt',
        'authorId',
        // We intentionally skip:
        // * depth
        // * nestedSetIndex
        // * nestedSetNextSibling
        // as those will be updated in bulk soon afterwards together with all descendants.
      ]
      if (author.hideArticleDates) {
        updateOnDuplicate.push('createdAt')
      }
      if (list !== undefined) {
        updateOnDuplicate.push('list')
      }
      await sequelize.models.Article.bulkCreate(
        articleArgs,
        {
          updateOnDuplicate,
          transaction,
          // Trying this to validate mas titleSource length here leads to another error.
          // validate: true,
          // individualHooks: true,
        }
      )

      // Find here because upsert not yet supported in SQLite, so above updateOnDuplicate wouldn't work.
      // https://stackoverflow.com/questions/29063232/how-to-get-the-id-of-an-inserted-or-updated-record-in-sequelize-upsert
      articles = await sequelize.models.Article.getArticles({
        count: false,
        order: 'slug',
        orderAscDesc: 'ASC',
        sequelize,
        slug: articleArgs.map(arg => sequelize.models.Article.slugTransform(arg.slug)),
        transaction,
      })
      if (updateTree) {
        await Promise.all([
          // Check file limit
          sequelize.models.File.count({ where: { authorId: author.id }, transaction }).then(articleCountByLoggedInUser => {
            if (enforceMaxArticles) {
              const err = hasReachedMaxItemCount(author, articleCountByLoggedInUser - 1, 'articles')
              if (err) { throw new ValidationError(err, 403) }
            }
          }),
          (async () => {
            if (oldRef) {
              // Move an existing article to the new location determined by the user via API parentId field.
              await sequelize.models.Article.treeMoveRangeTo({
                logging: false,
                depthDelta: newDepth - oldDepth,
                // Total toplevel sibling articles to be moved, excluding their descendants.
                nArticlesToplevel: 1,
                // Total articles to be moved, including toplevel siblings and their descendants.
                nArticles: nestedSetSize,
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
                username: author.username,
              })
            }

            // Synonym handling part 2
            // Now that we have the new article we merge any pre-existing synonyms into it.
            // All issues are moved into this new article, and then
            // the synonym articles are destroyed.
            if (synonymIds.length) {
              const article = articles[0]
              // TODO this find could be replaced with manual updating of the prefetched articles
              // to account for things moving around.
              const synonymArticles = await sequelize.models.Article.getArticles({
                count: false,
                includeParentAndPreviousSibling: true,
                sequelize,
                slug: synonymIds.map(id => idToSlug(id)),
                transaction,
              })
              const synonymIdsToArticles = {}
              for (const article of synonymArticles) {
                synonymIdsToArticles[slugToId(article.slug)] = article
              }

              let synonymNewNestedSetIndex = newNestedSetIndex + nestedSetSize
              let [lastIssue, synonym_new_to_id_index_ref] = await Promise.all([
                sequelize.models.Issue.findOne({
                  order: [['number', 'DESC']],
                  where: { articleId: article.id, },
                  transaction,
                }),
                sequelize.models.Ref.findOne({
                  where: {
                    from_id: toplevelId,
                    type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                    to_id_index: {[sequelize.Sequelize.Op.ne]: null},
                  },
                  order: [['to_id_index', 'DESC']],
                  transaction
                }),
                sequelize.models.UserLikeArticle.destroy({
                  where: { articleId: synonymArticles.map(a => a.id) },
                  transaction
                }),
              ])
              let synonym_new_to_id_index = synonym_new_to_id_index_ref === null ? 0 : synonym_new_to_id_index_ref.to_id_index + 1
              let issueNumberDelta = lastIssue ? lastIssue.number : 0
              for (const synonymId of synonymIds) {
                const synonymArticle = synonymIdsToArticles[synonymId]
                if (synonymArticle) {
                  const synonymNDescendantArticles = synonymArticle.nestedSetNextSibling - synonymArticle.nestedSetIndex - 1
                  const synonymNChildArticles = await sequelize.models.Ref.count({
                    where: {
                      from_id: synonymArticle.idid,
                      type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                    },
                    transaction
                  })
                  const [[synonymNIssues], _] = await Promise.all([
                    // Move issues of synonym to new article.
                    sequelize.models.Issue.update(
                      {
                        number: sequelize.fn(`${issueNumberDelta} + `, sequelize.col('number')),
                        articleId: article.id,
                      },
                      {
                        where: { articleId: synonymArticle.id, },
                        transaction,
                      }
                    ),
                    // Move all children of deleted synonym to its new parent.
                    sequelize.models.Article.treeMoveRangeTo({
                      logging: false,
                      depthDelta: article.depth - synonymArticle.depth,
                      nArticlesToplevel: synonymNChildArticles,
                      nArticles: synonymNDescendantArticles,
                      newNestedSetIndex: synonymNewNestedSetIndex,
                      newNestedSetIndexParent: article.nestedSetIndex,
                      newParentId: toplevelId,
                      new_to_id_index: synonym_new_to_id_index,
                      oldNestedSetIndex: synonymArticle.nestedSetIndex + 1,
                      oldNestedSetIndexParent: synonymArticle.nestedSetIndex,
                      oldParentId: synonymArticle.idid,
                      old_to_id_index: 0,
                      transaction,
                      updateNestedSetIndex,
                      username: author.username,
                    })
                  ])

                  // Account for changes in position due to descendant moving since we fetched this from DB.
                  let forceNestedSetIndex
                  if (
                    synonymArticle.parentId.idid === newParentId &&
                    new_to_id_index <= synonym_new_to_id_index
                  ) {
                    synonymArticle.nestedSetIndex += synonymNDescendantArticles
                  }
                  synonymArticle.nestedSetNextSibling = synonymArticle.nestedSetIndex + 1

                  await synonymArticle.destroySideEffects({
                    logging: false,
                    transaction,
                  })
                  synonymNewNestedSetIndex += synonymNDescendantArticles
                  synonym_new_to_id_index += synonymNChildArticles
                  issueNumberDelta += synonymNIssues
                }
              }
            }
          })(),
          !oldRef && sequelize.models.Topic.updateTopics(articles, { newArticles: true, transaction }),
          !oldRef && Promise.all(articles.map(article => author.addArticleFollowSideEffects(article, { transaction }))),
        ])
      }
    } else {
      articles = []
    }
  })
  if (perf) {
    console.error(`perf: convertArticle.finish: ${performance.now() - t0} ms`);
  }
  return { articles, extra_returns, nestedSetNeedsUpdate }
}

async function convertComment({
  comment,
  date,
  issue,
  number,
  sequelize,
  source,
  transaction,
  user,
}) {
  if (source === undefined) {
    source = comment.source
  } else if(comment !== undefined) {
    comment.source = source
  }
  return sequelize.transaction({ transaction }, async (transaction) => {
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
      transaction,
      type: 'comment',
    })
    const outpath = Object.keys(extra_returns.rendered_outputs)[0]
    const renders = extra_returns.rendered_outputs[outpath]
    const render = renders.full
    if (comment === undefined) {
      const outpath = Object.keys(extra_returns.rendered_outputs)[0]
      const attrs = {
        number,
        render: extra_returns.rendered_outputs[outpath].full,
        source,
      }
      if (date) {
        attrs.createdAt = date
        // TODO doesn't really work
        attrs.updatedAt = date
      }
      return sequelize.models.Comment.createSideEffects(
        user,
        issue,
        attrs,
        { transaction }
      )
    } else {
      comment.render = render
      if (date) {
        comment.createdAt = date
        comment.updatedAt = date
      }
      return comment.save({ transaction })
    }
  })
}

async function convertIssue({
  article,
  bodySource,
  date,
  issue,
  number,
  sequelize,
  titleSource,
  transaction,
  user,
}) {
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
    if (number === undefined) {
      number = issue.number
    }
    if (article === undefined) {
      article = issue.article
    }
  }
  if (titleSource.length > maxArticleTitleSize) {
    //throw new ValidationError(`Title source too long: ${titleSource.length} bytes, maximum: ${maxArticleTitleSize} bytes, title: ${titleSource}`)
  }
  return sequelize.transaction({ transaction }, async (transaction) => {
    // We use routes here to achieve a path that matches the exact length of what the issue will render to,
    // so that the internal links will render with the correct number of ../
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
      transaction,
      titleSource,
      type: 'issue',
    })
    const outpath = Object.keys(extra_returns.rendered_outputs)[0]
    const renders = extra_returns.rendered_outputs[outpath]
    const titleRender = renders.title
    const render = renders.full
    if (issue === undefined) {
      const attrs = {
        bodySource,
        date,
        number,
        render,
        titleRender,
        titleSource,
      }
      if (date) {
        attrs.createdAt = date
        // TODO doesn't really work
        attrs.updatedAt = date
      }
      return sequelize.models.Issue.createSideEffects(
        user,
        article,
        attrs,
        {
          transaction,
        },
      )
    } else {
      issue.titleRender = titleRender
      issue.render = render
      if (date) {
        issue.createdAt = date
        issue.updatedAt = date
      }
      return issue.save({ transaction })
    }
  })
}

function scopeIdToPath(scope, id) {
  return `${scope}/${id ? id : ourbigbook.INDEX_BASENAME_NOEXT}.${ourbigbook.OURBIGBOOK_EXT}`
}

module.exports = {
  convert,
  convertArticle,
  convertComment,
  convertIssue,
  getConvertOpts,
}
