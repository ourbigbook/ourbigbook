const lodash = require('lodash')

const ourbigbook = require('ourbigbook')
const {
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqliteDbProvider,
} = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

const { ValidationError } = require('./api/lib')
const { convertOptions, forbidMultiheaderMessage, maxArticleTitleSize, read_include_web } = require('./front/config')
const { modifyEditorInput } = require('./front/js')
const routes = require('./front/routes')

// Subset of convertArticle for usage in issues and comments.
// This is a much simpler procedure as it does not alter the File/Article database.
async function convert({
  author,
  bodySource,
  convertOptionsExtra,
  path,
  render,
  sequelize,
  splitHeaders,
  titleSource,
  transaction,
}) {
  const db_provider = new SqliteDbProvider(sequelize)
  const extra_returns = {};
  bodySource = bodySource.replace(/\n+$/, '')
  const input = modifyEditorInput(titleSource, bodySource).new
  if (path === undefined) {
    path = titleSource ? ourbigbook.title_to_id(titleSource) : 'asdf'
  }
  const input_path = `${ourbigbook.AT_MENTION_CHAR}${author.username}/${path}.${ourbigbook.OURBIGBOOK_EXT}`
  await ourbigbook.convert(
    input,
    lodash.merge({
      db_provider,
      input_path,
      ourbigbook_json: {
        h: {
          splitDefault: false,
          splitDefaultNotToplevel: true,
        },
      },
      read_include: read_include_web(async (idid) => (await sequelize.models.Id.count({ where: { idid }, transaction })) > 0),
      ref_prefix: `${ourbigbook.AT_MENTION_CHAR}${author.username}`,
      render,
      split_headers: splitHeaders === undefined ? true : splitHeaders,
      web: true,
    }, convertOptions, convertOptionsExtra),
    extra_returns,
  )
  if (extra_returns.errors.length > 0) {
    const errsNoDupes = remove_duplicates_sorted_array(
      extra_returns.errors.map(e => e.toString()))
    throw new ValidationError(errsNoDupes)
  }
  return { db_provider, extra_returns, input_path }
}

// This does the type of stuff that OurBigBook CLI does for CLI
// around the conversion itself, i.e. setting up the database, saving output files
// but on the Web.
//
// This is how Articles should always be created and updated.
async function convertArticle({
  author,
  bodySource,
  forceNew,
  path,
  parentId,
  previousSiblingId,
  render,
  sequelize,
  titleSource,
  transaction,
}) {
  let articles
  await sequelize.transaction({ transaction }, async (transaction) => {
    if (render === undefined) {
      render = true
    }
    const { db_provider, extra_returns, input_path } = await convert({
      author,
      bodySource,
      convertOptionsExtra: {
        forbid_multiheader: forbidMultiheaderMessage,
        parent_id: parentId,
      },
      forceNew,
      path,
      render,
      sequelize,
      titleSource,
      transaction,
    })
    const toplevelId = extra_returns.context.header_tree.children[0].ast.id
    if (forceNew && await sequelize.models.File.findOne({ where: { path: input_path }, transaction })) {
      throw new ValidationError(`Article with this ID already exists: ${toplevelId}`)
    }
    const oldRef = await sequelize.models.Ref.findOne({
      where: { to_id: toplevelId },
      type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
      include: {
        model: sequelize.models.Id,
        as: 'from',
      },
      transaction
    })
    const idPrefix = `${ourbigbook.AT_MENTION_CHAR}${author.username}`
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
          throw new ValidationError(`parentId argument is mandatory for new articles, but article ID "${toplevelId}" does not exist yet`)
        }
      }
    }
    await update_database_after_convert({
      authorId: author.id,
      bodySource,
      extra_returns,
      db_provider,
      sequelize,
      path: input_path,
      render,
      titleSource,
      transaction,
    })
    let parentIdRow, previousSiblingRef
    let refWhere = { to_id: previousSiblingId }
    if (parentId !== undefined) {
      refWhere.from_id = parentId
    }
    ;[parentIdRow, previousSiblingRef] = await Promise.all([
      parentId !== undefined ? sequelize.models.Id.findOne({ where: { idid: parentId }, transaction }) : null,
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
              },
              {
                model: sequelize.models.Id,
                as: 'from',
              },
            ],
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
            transaction,
          })
    ])

    if (previousSiblingRef) {
      // Deduce parent from given sibling.
      parentIdRow = previousSiblingRef.from
      parentId = parentIdRow.idid
    } else if (previousSiblingId) {
      throw new ValidationError(`previousSiblingId "${previousSiblingId}" does not exist, is not a header or is not a child of parentId "${parentId}"`)
    }
    if (
      // Fails only for the index page which has no parent.
      parentId !== undefined
    ) {
      // Calculate to_id_index, i.e. where to insert the new header.
      let to_id_index
      if (!parentIdRow) {
        throw new ValidationError(`parentId does not exist: "${parentId}"`)
      }
      if (parentIdRow.macro_name !== ourbigbook.Macro.HEADER_MACRO_NAME) {
        throw new ValidationError(`parentId is not a header: "${parentI}"`)
      }
      if (previousSiblingRef) {
        to_id_index = previousSiblingRef.to_id_index + 1
      } else {
        to_id_index = 0
      }
      if (oldRef) {
        // Decrement sibling indexes after point we are removing from.
        await sequelize.models.Ref.decrement('to_id_index', {
          where: {
            from_id: oldRef.from_id,
            to_id_index: { [sequelize.Sequelize.Op.gt]: oldRef.to_id_index },
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
          transaction,
        })
      }
      // Increment sibling indexes after point we are inserting from.
      await sequelize.models.Ref.increment('to_id_index', {
        where: {
          from_id: parentId,
          to_id_index: { [sequelize.Sequelize.Op.gte]: to_id_index },
          type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        },
        transaction,
      })
      const newRefAttrs = {
        type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        to_id: toplevelId,
        from_id: parentId,
        inflected: false,
        to_id_index,
      }
      if (oldRef) {
        for (const key of Object.keys(newRefAttrs)) {
          oldRef[key] = newRefAttrs[key]
        }
        await oldRef.save({ transaction })
      } else {
        await sequelize.models.Ref.create(
          newRefAttrs,
          { transaction }
        )
      }
    }
    if (render) {
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
        articleArgs.push({
          fileId: file.id,
          render: rendered_output.full,
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
      await sequelize.models.Article.bulkCreate(
        articleArgs,
        {
          updateOnDuplicate: [
            'titleRender',
            'titleSource',
            'titleSourceLine',
            'render',
            'topicId',
            'updatedAt',
          ],
          transaction,
          // Trying this to validate mas titleSource length here leads to another error.
          // validate: true,
          // individualHooks: true,
        }
      )
      // Find here because upsert not yet supported in SQLite.
      // https://stackoverflow.com/questions/29063232/how-to-get-the-id-of-an-inserted-or-updated-record-in-sequelize-upsert
      articles = await sequelize.models.Article.findAll({
        where: { slug: articleArgs.map(arg => arg.slug) },
        include: {
          model: sequelize.models.File,
          as: 'file',
        },
        order: [['slug', 'ASC']],
        transaction,
      }),
      await sequelize.models.Topic.updateTopics(articles, { newArticles: true, transaction })
    } else {
      articles = []
    }
  })
  return articles
}

async function convertComment({ issue, number, sequelize, source, user }) {
  const { extra_returns } = await convert({
    author: user,
    bodySource: source,
    convertOptionsExtra: {
      x_external_prefix: '../'.repeat((routes.issue(issue.issues.slug, number).match(/\//g) || []).length - 1),
    },
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
      x_external_prefix: '../'.repeat((routes.issue(article.slug, number).match(/\//g) || []).length - 1),
    },
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
