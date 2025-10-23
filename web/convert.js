const lodash = require('lodash')

const ourbigbook = require('ourbigbook')
const {
  AT_MENTION_CHAR,
  INDEX_BASENAME_NOEXT,
  Macro,
  OURBIGBOOK_EXT,
  renderArg,
} = ourbigbook
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
const { path_sep } = convertOptions
const { hasReachedMaxItemCount, idToSlug, slugToId } = require('./front/js')

async function getActualPaths(sequelize, aRefs, author, transaction) {
  const { Upload, User } = sequelize.models
  const usernameIds = {
    [author.username]: author.id
  }
  const authorUsernames = aRefs.map(
    a => a.substring(ourbigbook.AT_MENTION_CHAR.length).split(
      path_sep)[0]
  ).filter(u => u != author.username)
  if (authorUsernames.length) {
    const authors = await User.findAll({
      where: { username: authorUsernames },
      transaction,
    })
    for (const author of authors) {
      usernameIds[author.username] = author.id
    }
  }
  const actualPaths = []
  const pathToActualPath = {}
  for (const aRef of aRefs) {
    const split = aRef.substring(ourbigbook.AT_MENTION_CHAR.length).split(
      path_sep
    )
    const actualPath = Upload.uidAndPathToUploadPath(
      usernameIds[split[0]],
      split.slice(1).join(path_sep)
    )
    actualPaths.push(actualPath)
    pathToActualPath[aRef] = actualPath
  }
  return { actualPaths, pathToActualPath }
}

function getConvertOpts({
  author,
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
        getAFileTypes: async (aRefs) => {
          const { Upload } = sequelize.models
          const { actualPaths, pathToActualPath } = await getActualPaths(
            sequelize, aRefs, author, transaction)
          const uploads = await Upload.findAll({
            where: { path: actualPaths },
            transaction,
          })
          const exists = new Set(uploads.map(upload => upload.path))
          let ret = {}
          for (const aRef of aRefs) {
            ret[aRef] = exists.has(pathToActualPath[aRef])
              ? ourbigbook.FILE_TYPE_FILE : ourbigbook.FILE_TYPE_DIRECTORY
          }
          return ret
        },
        input_path,
        ourbigbook_json: {
          h: {
            splitDefault: false,
            splitDefaultNotToplevel: true,
          },
        },
        parent_id: parentId,
        read_include: read_include_web(async (idid) => (await sequelize.models.Id.count({ where: { idid }, transaction })) > 0),
        ref_prefix: `${AT_MENTION_CHAR}${author.username}`,
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
  convertOptionsExtra,
  parentId,
  path,
  perf,
  render,
  sequelize,
  source,
  splitHeaders,
  transaction,
  type,
}) {
  let t0
  if (perf) {
    t0 = performance.now();
    console.error('perf: convert.start');
  }
  const { db_provider, convertOptions } = getConvertOpts({
    author,
    input_path: path,
    parentId,
    render,
    sequelize,
    splitHeaders,
    transaction,
    type,
  })
  const extra_returns = {}
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
 * Regarding the article tree:
 * - unless updateTree=false, which is not exposed to end users, the Ref parent tree
 *   is always up-to-date and consistent, including with render=false
 * - the nested set index can become out of date in a few different cases including:
 *   - render=false
 *   - updateNestedSetIndex=false
 *   both of which are exposed to users and exercized by the ourbigbook CLI.
 *
 * @param {string} parentId - Required for h2Render to render correctly. Otherwise it looks like an h1Render.
 * @param {boolean} updateTree - If false, don't change the position of the article in the tree.
 *   This also prevents the creation of new articles, only content updates are allowed in that case.
 *   This option can massively save time by skipping unnecessary nested set tree updates.
 *   This option is just an optimization, originally introduced for rerender.
 *   It is not exposed to end users, for which we always update the tree.
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
  updateUpdatedAt,
}) {
  if (render === undefined) {
    render = true
  }
  if (updateNestedSetIndex === undefined) {
    updateNestedSetIndex = true
  }
  if (updateHash === undefined) {
    updateHash = true
  }
  if (updateTree === undefined) {
    updateTree = true
  }
  if (updateUpdatedAt === undefined) {
    updateUpdatedAt = true
  }
  let t0
  const { Article, File, Id, Issue, Ref, Topic, UserLikeArticle } = sequelize.models
  if (perf) {
    t0 = performance.now();
    console.error(`perf: convertArticle.start titleSource="${titleSource}"`);
  }
  let articles
  let extra_returns
  const convertType = 'article'
  if (enforceMaxArticles === undefined) {
    enforceMaxArticles = true
  }
  if (convertOptionsExtra === undefined) {
    convertOptionsExtra = {}
  }
  let nestedSetNeedsUpdate = true
  const source = ourbigbook.modifyEditorInput(titleSource, bodySource).new
  const idPrefix = `${AT_MENTION_CHAR}${author.username}`
  await sequelize.transaction({ transaction }, async (transaction) => {
    // Determine the correct parentId from parentId and previousSiblingId
    let newParentId = parentId
    let newParentArticle
    let parentIdRow
    const parentAndPreviousSiblingPromises = []
    if (newParentId !== undefined) {
      const findParent = async (isSynonym) => {
        let include
        const idInclude = {
          model: File,
          required: false,
          as: 'toplevelId',
          include: [
            {
              model: Article,
              as: 'articles',
            }
          ],
        }
        if (isSynonym) {
          include = [{
            model: Ref,
            as: 'from',
            required: true,
            where: {
              type: Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
            },
            include: [{
              model: Id,
              as: 'to',
              include: [idInclude]
            }]
          }]
        } else {
          include = [idInclude]
          if (newParentId !== idPrefix) {
            // This ID is not the index and has a parent point to it.
            // Therefore it cannot be a synonym.
            include.push({
              model: Ref,
              as: 'to',
              required: true,
              where: {
                type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              },
            })
          }
        }
        return Id.findOne({
          include,
          subQuery: false,
          where: {
            idid: newParentId,
            macro_name: Macro.HEADER_MACRO_NAME,
          },
        })
      }
      parentAndPreviousSiblingPromises.push(...[
        findParent(false),
        findParent(true),
      ])
    } else {
      parentAndPreviousSiblingPromises.push(null, null)
    }
    if (previousSiblingId !== undefined) {
      let refWhere = {
        to_id: previousSiblingId,
        type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
      }
      if (newParentId !== undefined) {
        refWhere.from_id = newParentId
      }
      parentAndPreviousSiblingPromises.push(
        Ref.findOne({
          where: refWhere,
          include: [
            {
              model: Id,
              as: 'to',
              where: {
                macro_name: Macro.HEADER_MACRO_NAME,
              },
              include: [
                {
                  model: File,
                  as: 'toplevelId',
                  include: [
                    {
                      model: Article,
                      as: 'articles',
                    }
                  ],
                }
              ],
            },
            {
              model: Id,
              as: 'from',
              include: [
                {
                  model: File,
                  as: 'toplevelId',
                  include: [
                    {
                      model: Article,
                      as: 'articles',
                    }
                  ],
                }
              ],
            },
          ],
          transaction,
        })
      )
    } else {
      parentAndPreviousSiblingPromises.push(null)
    }
    const [
      parentIdNoSynonym,
      parentIdSynonym,
      previousSiblingRef,
    ] = await Promise.all(parentAndPreviousSiblingPromises)
    if (parentIdNoSynonym) {
      // We prefer the non-synonym header if there is one.
      parentIdRow = parentIdNoSynonym
    } else {
      if (parentIdSynonym) {
        // If there is no non-synonym header, we just pick one of the synonym headers at random.
        // There can be more than one at the render: false phase before we are checking for duplicates.
        const from = parentIdSynonym.from
        if (from.length) {
          // This is a synonym. Use the non-synonym target instead.
          parentIdRow = from[0].to
          newParentId = parentIdRow.idid
        }
      }
    }
    if (previousSiblingRef) {
      // Deduce parent from given sibling.
      parentIdRow = previousSiblingRef.from
      newParentId = parentIdRow.idid
      newParentArticle = parentIdRow.toplevelId.articles[0]
    }

    // Determine the input_path and toplevelId
    let input_path
    let toplevelId
    {
      if (
        // This case could likely be handled more elegantly inside the else
        // by correctly adding username as a prefix to input_path there. But I'm
        // lazy to think now on possible ramifications.
        path === INDEX_BASENAME_NOEXT
      ) {
        input_path = `${AT_MENTION_CHAR}${author.username}/${INDEX_BASENAME_NOEXT}.${OURBIGBOOK_EXT}`
        toplevelId = `${AT_MENTION_CHAR}${author.username}`
      } else {
        let scope
        // Do one pre-conversion to determine the file path.
        // All we need from it is the toplevel header.
        // E.g. this finds the correct path from id= and {disambiguate=
        // https://github.com/ourbigbook/ourbigbook/issues/304
        // We do this even when path is known in order to catch
        // the 'index' -> '' path to ID conversion.
        const extra_returns = {}
        const { convertOptions } = getConvertOpts({
          author,
          extraOptions: {
            h1Only: true,
          },
          input_path: path === undefined ? undefined : `${path}.${OURBIGBOOK_EXT}`,
          render: false,
          sequelize,
          splitHeaders: false,
          transaction,
          type: convertType,
        })
        await ourbigbook.convert(
          source,
          lodash.merge(convertOptions, convertOptionsExtra),
          extra_returns,
        )
        const toplevelAst = extra_returns.context.header_tree.children[0].ast
        const toplevelIdNoUsername = toplevelAst.id
        if (path === undefined && parentIdRow) {
          const context = ourbigbook.convertInitContext()
          const parentH1Ast = ourbigbook.AstNode.fromJSON(parentIdRow.ast_json, context)
          parentH1Ast.id = parentIdRow.idid
          const parentScope = parentH1Ast.calculate_scope()
          // Inherit scope from parent. In particular, this forces every article by a
          // user to be scoped under @username due to this being recursive from the index page.
          scope = parentScope
        }
        if (scope === undefined) {
          scope = idPrefix
        }
        input_path = `${scope}/${toplevelIdNoUsername ? toplevelIdNoUsername : INDEX_BASENAME_NOEXT}.${OURBIGBOOK_EXT}`
        toplevelId = `${scope}${toplevelIdNoUsername ? '/' + toplevelIdNoUsername : ''}`
        if (toplevelId !== toplevelId.toLowerCase() && !toplevelAst.validation_output.file.given) {
          throw new ValidationError(`Article ID cannot contain uppercase characters: "${toplevelId}"`)
        }
      }
      if (forceNew && (await File.findOne({ where: { path: input_path }, transaction }))) {
        throw new ValidationError(`Article with this ID already exists: ${toplevelId}`)
      }
    }

    // Check if the article already existed. If it did and
    // if we are still missing parentId and previousSiblingId,
    // take them from the old article.
    const oldRef = await Ref.findOne({
      where: {
        to_id: [toplevelId],
        type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
      },
      include: [
        {
          model: Id,
          as: 'to',
          include: [
            {
              model: File,
              as: 'toplevelId',
              include: [
                {
                  model: Article,
                  as: 'articles',
                }
              ],
            }
          ]
        },
        {
          model: Id,
          as: 'from',
          include: [
            {
              model: File,
              as: 'toplevelId',
              include: [
                {
                  model: Article,
                  as: 'articles',
                }
              ],
            }
          ]
        },
      ],
      transaction,
    })
    if (newParentId === undefined && oldRef) {
      parentIdRow = oldRef.from
    }
    if (parentIdRow) {
      // Happens when updating a page.
      newParentId = parentIdRow.idid
      newParentArticle = parentIdRow.toplevelId.articles[0]
    }

    // Error checking on parentId and previousSiblingId
    if (parentId && !parentIdRow) {
      throw new ValidationError(`parentId does not exist: "${newParentId}"`)
    }
    if (parentIdRow && parentIdRow.macro_name !== Macro.HEADER_MACRO_NAME) {
      throw new ValidationError(`parentId is not a header: "${newParentId}"`)
    }
    // Index conversion check.
    const isIndex = toplevelId === idPrefix
    if (isIndex && parentId !== undefined) {
      // As of writing, this will be caught and thrown on the ancestors part of conversion:
      // as changing the Index to anything else always leads to infinite loop.
      throw new ValidationError(`cannot give parentId for index conversion, received "${toplevelId}"`)
    }
    if (previousSiblingId && !previousSiblingRef) {
      throw new ValidationError(`previousSiblingId "${previousSiblingId}" does not exist, is not a header or is not a child of parentId "${newParentId}"`)
    }
    if (newParentId) {
      if (
        newParentId === toplevelId ||
        (await fetch_ancestors(sequelize, newParentId, {
          onlyIncludeId: toplevelId,
          stopAt: toplevelId,
          transaction,
        })).length
      ) {
        throw new ValidationError(`parentId="${toplevelId}" would lead to infinite parent loop"`)
      }
    } else {
      if (!isIndex) {
        throw new ValidationError(`parent ID was not specified for new article "${toplevelId}", it is mandatory for new articles`)
      }
    }

    let db_provider
    ;({ db_provider, extra_returns } = await convert({
      author,
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
        fixedScopeRemoval: AT_MENTION_CHAR.length,
        h_web_metadata: true,
        prefixNonIndexedIdsWithParentId: true,
      }, convertOptionsExtra),
      forceNew,
      parentId,
      path: input_path,
      perf,
      render,
      sequelize,
      source,
      transaction,
      type: convertType,
    }))
    const toplevelAst = extra_returns.context.header_tree.children[0].ast

    // Synonym handling part 1
    const synonymHeadersArr = Array.from(extra_returns.context.synonym_headers)
    const synonymIds = synonymHeadersArr.map(h => h.id)
    const synonymArticles = await Article.getArticles({
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

    const update_database_after_convert_arg = {
      authorId: author.id,
      bodySource,
      extra_returns,
      db_provider,
      sequelize,
      synonymHeaderPaths: Array.from(extra_returns.context.synonym_headers).map(h => `${h.id}.${OURBIGBOOK_EXT}`),
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

    // Set the article of the parent. The previously existing ref, if there was one,
    // has already been necessarily removed during update_database_after_convert.
    let new_to_id_index
    if (previousSiblingRef) {
      new_to_id_index = previousSiblingRef.to_id_index + 1
    } else {
      new_to_id_index = 0
    }

    // Update nestedSetIndex and other things that can only be updated after the initial non-render pass.
    //
    // nestedSetIndex requires the initial non-render pass because it can only be calculated correctly
    //
    // Note however that nestedSetIndex is also calculated incrementally on the render pass, and as a result,
    // article instances returned by this function do not have the correct final value for it.
    let nestedSetSize
    let newDepth = 0
    let newNestedSetIndex = 0
    let newNestedSetIndexParent
    let newNestedSetNextSibling = 1
    let oldArticle
    let oldDepth
    let oldNestedSetIndex
    let oldNestedSetIndexParent
    let oldParentArticle
    let oldParentId
    let old_to_id_index
    if (previousSiblingRef) {
      const article = previousSiblingRef.to.toplevelId.articles[0]
      if (article) {
        newNestedSetIndex = article.nestedSetNextSibling
      }
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
      oldParentArticle = oldRef.from.toplevelId.articles[0]
      oldParentId = oldRef.from_id
      old_to_id_index = oldRef.to_id_index
      oldArticle = oldRef.to.toplevelId.articles[0]
      if (oldArticle) {
        oldNestedSetIndex = oldArticle.nestedSetIndex
        nestedSetSize = oldArticle.nestedSetNextSibling - oldArticle.nestedSetIndex
        oldNestedSetIndexParent = oldParentArticle.nestedSetIndex
        oldDepth = oldArticle.depth
      }
    } else if (isIndex) {
      old_to_id_index = 0
    }
    const doUpdateNestedSetIndex =
      updateNestedSetIndex &&
      // Don't update if not rendering, as articles might not exist and we store
      // nested information set in Article columns.
      // It would have been cleaner if the nested set was not a part of articles directly.
      // then we wouldn't have to think about this kind of issue.
      render &&
      // Can happen if the new position does not have an article yet.
      newNestedSetIndex !== undefined
    if (!oldArticle) {
      nestedSetSize = 1
    }
    newNestedSetNextSibling = newNestedSetIndex + nestedSetSize
    if (isIndex) {
      // It would be better to handle this by oldArticle to the old article.
      // But we don't have it in this case because there is no oldRef. So let's fake it until things blow up somehow.
      oldNestedSetIndex = newNestedSetIndex
      oldDepth = newDepth
    }
    nestedSetNeedsUpdate = !doUpdateNestedSetIndex &&
      (
        newParentId !== oldParentId ||
        new_to_id_index !== old_to_id_index
      )
    if (nestedSetNeedsUpdate && !author.nestedSetNeedsUpdate) {
      await author.update({ nestedSetNeedsUpdate: true }, { transaction })
    }

    if (
      // Fails only for the index page which has no parent.
      newParentId !== undefined &&
      // If the article is new, create space to insert it there.
      // For the moving of existing articles however, we leave the space opening up to the
      // Article.treeMoveRangeTo function instead.
      updateTree
    ) {
      const openSpaceForNestedSet = doUpdateNestedSetIndex && !oldArticle
      await Article.treeOpenSpace({
        parentNestedSetIndex: newNestedSetIndexParent,
        perf,
        nestedSetIndex: newNestedSetIndex,
        parentId: newParentId,
        shiftNestedSetBy: nestedSetSize,
        shiftRefBy: 1,
        to_id_index: new_to_id_index,
        transaction,
        updateRef: !oldRef,
        updateNestedSetIndex: openSpaceForNestedSet,
        username: author.username,
      })
      if (
        openSpaceForNestedSet &&
        newNestedSetIndex <= oldNestedSetIndexParent
      ) {
        oldNestedSetIndexParent += nestedSetSize
      }
    }

    if (!isIndex && !oldRef) {
      // Must come after the previous treeOpenSpace call.
      await Ref.create(
        {
          type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          to_id: toplevelId,
          from_id: newParentId,
          inflected: false,
          to_id_index: new_to_id_index,
          defined_at: null,
        },
        { transaction }
      )
    }

    if (render) {
      const [check_db_errors, file] = await Promise.all([
        ourbigbook_nodejs_webpack_safe.check_db(
          sequelize,
          [input_path],
          {
            // All paths here are the fully qualified paths, e.g. @user0/subdir/myfile.txt
            filterFilesThatDontExist: async (aRefs) => {
              const { Upload, UploadDirectory } = sequelize.models
              const { actualPaths, pathToActualPath } = await getActualPaths(
                sequelize, aRefs.map(a => a.to), author, transaction)
              const [uploads, uploadDirectories] = await Promise.all([
                Upload.findAll({
                  where: { path: actualPaths },
                  transaction,
                }),
                UploadDirectory.findAll({
                  where: { path: actualPaths },
                  transaction,
                }),
              ])
              const exists = new Set(uploads.concat(uploadDirectories).map(upload => upload.path))
              return aRefs.filter(aRef => !(exists.has(pathToActualPath[aRef.to])))
            },
            web: true,
            perf,
            transaction,
          },
        ),
        File.findOne({ where: { path: input_path }, transaction }),
      ])
      if (check_db_errors.length > 0) {
        throw new ValidationError(check_db_errors)
      }
      // Actual rendering.
      const ancestorsWithScopeRenders = []
      const ancestors = await fetch_ancestors(sequelize, toplevelId, {
        transaction,
      })
      const context = extra_returns.context
      for (const ancestor of ancestors.slice(1)) {
        const ast = ourbigbook.AstNode.fromJSON(
          ancestor.ast_json, context
        )
        if (ast.validation_output.scope.given) {
          ancestorsWithScopeRenders.push(
            renderArg(ast.args[Macro.TITLE_ARGUMENT_NAME], context)
          )
        }
      }
      const articleArgs = []
      for (const outpath in extra_returns.rendered_outputs) {
        const rendered_output = extra_returns.rendered_outputs[outpath]
        const renderFull = rendered_output.full
        const topicId = outpath.slice(
          AT_MENTION_CHAR.length + author.username.length + 1,
          -ourbigbook.HTML_EXT.length - 1
        )
        const articleArg = {
          authorId: author.id,
          fileId: file.id,
          h1Render: renderFull.substring(0, rendered_output.h1RenderLength),
          h2Render: rendered_output.h2Render,
          render: renderFull.substring(rendered_output.h1RenderLength),
          slug: outpath.slice(AT_MENTION_CHAR.length, -ourbigbook.HTML_EXT.length - 1),
          titleRender: rendered_output.title,
          titleRenderPlaintext: rendered_output.titleRenderPlaintext,
          titleRenderWithScope: [
              ...ancestorsWithScopeRenders,
              rendered_output.title,
            ].join(` <span class="meta">${ourbigbook.Macro.HEADER_SCOPE_SEPARATOR}</span> `)
          ,
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
        if (doUpdateNestedSetIndex) {
          articleArg.depth = newDepth
        }
        if (!author.hideArticleDates) {
          const d = new Date()
          articleArg.createdAt = d
          articleArg.updatedAt = d
        }
        articleArgs.push(articleArg)
        if (titleSource.length > maxArticleTitleSize) {
          throw new ValidationError(`Title source too long: ${titleSource.length} bytes, maximum: ${maxArticleTitleSize} bytes, title: ${titleSource}`)
        }
      }
      const articleArgs0 = articleArgs[0]
      if (doUpdateNestedSetIndex) {
        // Due to this limited setup, nested set ordering currently only works on one article per source setups.
        // https://docs.ourbigbook.com/todo#web-create-multiple-headers
        articleArgs0.nestedSetIndex = newNestedSetIndex
        articleArgs0.nestedSetNextSibling = newNestedSetNextSibling
      }

      const updateOnDuplicate = [
        'h1Render',
        'h2Render',
        'titleRender',
        'titleRenderPlaintext',
        'titleRenderWithScope',
        'titleSource',
        'titleSourceLine',
        'render',
        'topicId',
        'authorId',
        // We intentionally skip:
        // * depth
        // * nestedSetIndex
        // * nestedSetNextSibling
        // as those will be updated in bulk soon afterwards together with all descendants.
      ]
      if (updateUpdatedAt) {
        updateOnDuplicate.push('updatedAt')
      }
      if (list !== undefined) {
        updateOnDuplicate.push('list')
      }
      await Article.bulkCreate(
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
      articles = await Article.getArticles({
        count: false,
        order: 'slug',
        orderAscDesc: 'ASC',
        sequelize,
        slug: articleArgs.map(arg => Article.slugTransform(arg.slug)),
        transaction,
      })
    } else {
      articles = []
    }
    if (updateTree) {
      await Promise.all([
        // Check file limit
        render && File.count({ where: { authorId: author.id }, transaction }).then(articleCountByLoggedInUser => {
          if (enforceMaxArticles) {
            const err = hasReachedMaxItemCount(author, articleCountByLoggedInUser - 1, 'articles')
            if (err) { throw new ValidationError(err, 403) }
          }
        }),
        (async () => {
          if (oldRef) {
            // Move an existing article to the new location determined by the user via API parentId field.
            await Article.treeMoveRangeTo({
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
              updateNestedSetIndex: doUpdateNestedSetIndex && oldArticle !== undefined,
              username: author.username,
            })
          }

          // Synonym handling part 2
          // Now that we have the new article we merge any pre-existing synonyms into it.
          // All issues are moved into this new article, and then
          // the synonym articles are destroyed.
          if (render && synonymIds.length) {
            const article = articles[0]
            // TODO this find could be replaced with manual updating of the prefetched articles
            // to account for things moving around.
            const synonymArticles = await Article.getArticles({
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
              Issue.findOne({
                order: [['number', 'DESC']],
                where: { articleId: article.id, },
                transaction,
              }),
              Ref.findOne({
                where: {
                  from_id: toplevelId,
                  type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                  to_id_index: {[sequelize.Sequelize.Op.ne]: null},
                },
                order: [['to_id_index', 'DESC']],
                transaction
              }),
              UserLikeArticle.destroy({
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
                const synonymNChildArticles = await Ref.count({
                  where: {
                    from_id: synonymArticle.idid,
                    type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
                  },
                  transaction
                })
                const [[synonymNIssues], _] = await Promise.all([
                  // Move issues of synonym to new article.
                  Issue.update(
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
                  Article.treeMoveRangeTo({
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
                    updateNestedSetIndex: doUpdateNestedSetIndex,
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
        render && !oldArticle && Topic.updateTopics(articles, { newArticles: true, transaction }),
        render &&
          !oldArticle && Promise.all(articles.map(
            article => author.addArticleFollowSideEffects(article, { transaction })
          )),
      ])
    }
  })
  if (perf) {
    console.error(`perf: convertArticle.finish: ${performance.now() - t0} ms`);
  }
  return { articles, extra_returns, nestedSetNeedsUpdate }
}

async function convertComment({
  comment,
  convertOptionsExtra,
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
      convertOptionsExtra: Object.assign({
        fixedScopeRemoval: 0,
        tocIdPrefix: `${commentIdPrefix}${number}-`,
      }, convertOptionsExtra),
      path: `@${user.username}/${commentIdPrefix}${number}/${INDEX_BASENAME_NOEXT}.${OURBIGBOOK_EXT}`,
      render: true,
      sequelize,
      source,
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

async function convertDiscussion({
  article,
  bodySource,
  convertOptionsExtra,
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
  const source = ourbigbook.modifyEditorInput(titleSource, bodySource).new
  return sequelize.transaction({ transaction }, async (transaction) => {
    // We use routes here to achieve a path that matches the exact length of what the issue will render to,
    // so that the internal links will render with the correct number of ../
    const { extra_returns } = await convert({
      author: user,
      convertOptionsExtra: Object.assign({
        fixedScopeRemoval: 0,
        h_web_metadata: true,
      }, convertOptionsExtra),
      path: `@${user.username}/_issue-${article.slug}/${number}/${INDEX_BASENAME_NOEXT}.${OURBIGBOOK_EXT}`,
      render: true,
      sequelize,
      source,
      splitHeaders: false,
      transaction,
      type: 'issue',
    })
    const outpath = Object.keys(extra_returns.rendered_outputs)[0]
    const renders = extra_returns.rendered_outputs[outpath]
    const titleRender = renders.title
    const titleRenderPlaintext = renders.titleRenderPlaintext
    const render = renders.full
    if (issue === undefined) {
      const attrs = {
        bodySource,
        date,
        number,
        render,
        titleRender,
        titleRenderPlaintext,
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
      issue.titleRenderPlaintext = titleRenderPlaintext
      issue.render = render
      if (date) {
        issue.createdAt = date
        issue.updatedAt = date
      }
      return issue.save({ transaction })
    }
  })
}

module.exports = {
  convert,
  convertArticle,
  convertComment,
  convertDiscussion,
  getConvertOpts,
}
