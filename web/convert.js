const ourbigbook = require('ourbigbook')
const {
  update_database_after_convert,
  remove_duplicates_sorted_array,
  SqliteFileProvider,
  SqliteIdProvider,
} = require('ourbigbook/nodejs_webpack_safe')
const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')

const { ValidationError } = require('./api/lib')
const { convertOptions } = require('./front/config')
const { modifyEditorInput } = require('./shared')

// This does the type of stuff that OurBigBook CLI does for CLI
// around the conversion itself, i.e. setting up the database, saving output files
// but on the Web.
//
// This is how Articles should always be created and updated.
async function convert({
  author,
  body,
  sequelize,
  title,
  transaction,
}) {
  const id_provider = new SqliteIdProvider(sequelize)
  const file_provider = new SqliteFileProvider(sequelize, id_provider);
  const extra_returns = {};
  const id = ourbigbook.title_to_id(title)
  body = body.replace(/\n+$/, '')
  const input = modifyEditorInput(title, body)
  const input_path = `${ourbigbook.AT_MENTION_CHAR}${author.username}/${id}${ourbigbook.OURBIGBOOK_EXT}`
  await ourbigbook.convert(
    input,
    Object.assign({
      id_provider,
      file_provider,
      input_path,
      read_include: ourbigbook_nodejs_webpack_safe.read_include({
        exists: async (inpath) => {
          const suf = ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + ourbigbook.INDEX_BASENAME_NOEXT
          let idid
          if (inpath.endsWith(suf)) {
            idid = inpath.slice(0, -suf.length)
          } else {
            idid = inpath
          }
          return (await sequelize.models.Id.count({ where: { idid }, transaction })) > 0
        },
        // Only needed for --embed-includes, which is not implemented on the dynamic website for now.
        read: (inpath) => '',
        path_sep: ourbigbook.Macro.HEADER_SCOPE_SEPARATOR,
        ext: '',
      }),
      remove_leading_at: true,
    }, convertOptions),
    extra_returns,
  )
  if (extra_returns.errors.length > 0) {
    const errsNoDupes = remove_duplicates_sorted_array(
      extra_returns.errors.map(e => e.toString()))
    throw new ValidationError(errsNoDupes, 422)
  }
  const idid = extra_returns.context.header_tree.children[0].ast.id
  const filePath = `${idid}${ourbigbook.OURBIGBOOK_EXT}`
  await update_database_after_convert({
    authorId: author.id,
    body,
    extra_returns,
    id_provider,
    sequelize,
    path: filePath,
    render: true,
    title,
    transaction,
  })
  const file = await sequelize.models.File.findOne({where: { path: filePath}})
  const check_db_errors = await ourbigbook_nodejs_webpack_safe.check_db(
    sequelize,
    [input_path],
    transaction
  )
  if (check_db_errors.length > 0) {
    throw new ValidationError(check_db_errors, 422)
  }
  const articleArgs = []
  for (const outpath in extra_returns.rendered_outputs) {
    articleArgs.push({
      fileId: file.id,
      render: extra_returns.rendered_outputs[outpath],
      slug: outpath.slice(ourbigbook.AT_MENTION_CHAR.length),
      title: extra_returns.rendered_headers[outpath.slice(0, -ourbigbook.HTML_EXT.length - 1)],
      topicId: idid.slice(ourbigbook.AT_MENTION_CHAR.length + author.username.length + 1),
    })
  }
  await sequelize.models.Article.bulkCreate(
    articleArgs,
    { updateOnDuplicate: ['title', 'render', 'updatedAt'], transaction }
  )
  // Find here because upsert not yet supported in SQLite.
  // https://stackoverflow.com/questions/29063232/how-to-get-the-id-of-an-inserted-or-updated-record-in-sequelize-upsert
  return sequelize.models.Article.findAll({ where: { slug: articleArgs.map(arg => arg.slug) } })
}

module.exports = {
  convert,
}
