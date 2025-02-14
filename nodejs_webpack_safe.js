// TODO I don't know why, but webpack was failing with:
//   Error: Cannot find module 'ourbigbook/package.json'
// at:
//   const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')));
// from nodejs.js. Just splitting this out here until I find the patience to
// minimize and resolve that bs.
//
// Edit: this is a not a webpack issue. Doing:
//   path.dirname(require.resolve(path.join('ourbigbook', 'package.json'))
// from web/app.js also blows up.

const { Sequelize } = require('sequelize')

const fs = require('fs');
const path = require('path');

const ourbigbook = require('./index');
const ourbigbook_nodejs_front = require('./nodejs_front');
const web_api = require('./web_api');
const models = require('./models');
const ID_FTS_POSTGRESL_LANGUAGE = 'simple'

const ENCODING = 'utf8'
const SQLITE_MAGIC_MEMORY_NAME = ':memory:'

// DB options that have to be given to both ourbigbook CLI and dynamic website.
// These must be used for both for consistency, e.g. freezeTableName would lead
// to different able names in the database, which could break manually written queries.
// Yes, we could work around that by using model properties like models.Id.tableName,
// but having different tables in both cases would be too shorthand.
const DB_OPTIONS = {
  define: {
    freezeTableName: true,
  },
}

async function get_noscopes_base_fetch_rows(sequelize, ids, ignore_paths_set) {
  let rows
  if (ids.length) {
    const where = {
      idid: ids,
    }
    if (ignore_paths_set !== undefined) {
      const ignore_paths = Array.from(ignore_paths_set).filter(x => x !== undefined)
      where.path = { [sequelize.Sequelize.Op.not]: ignore_paths }
    }
    // Fetch in one go:
    // - starting point IDs
    // - from those starting point IDs:
    //   - parent
    //   - main synonym
    //   - title-title dependencies
    //     - from those, also fetch the main synonym
    rows = await sequelize.models.Id.findAll({
      where,
      include: [
        {
          model: sequelize.models.Ref,
          as: 'to',
          where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT] },
          required: false,
        },
        {
          model: sequelize.models.Ref,
          as: 'from',
          where: {
            type: { [sequelize.Sequelize.Op.or]: [
              sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_X_TITLE_TITLE],
              sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
            ]}
          },
          required: false,
          include: [
            {
              model: sequelize.models.Id,
              as: 'to',
              required: false,
              // This is to only get IDs here for REFS_TABLE_X_TITLE_TITLE,
              // and not for REFS_TABLE_PARENT.
              // Can't do it with a second include easily it seems:
              // https://stackoverflow.com/questions/51480266/joining-same-table-multiple-times-with-sequelize
              // so we are just hacking this custom ON here.
              on: {
                // This is the default ON condition. Don't know how to add a new condition to the default,
                // so just duplicating it here.
                '$from.to_id$': {[sequelize.Sequelize.Op.col]: 'from->to.idid' },
                // This gets only the TITLE TITLE and SYNONYM.
                '$from.type$': [
                  sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_X_TITLE_TITLE],
                  // For every \x to a synonym, we need to know the synonym target.
                  // This was originally added to decide if the synonym target is the
                  // toplevel ID or not, because if it is, we don't add a fragment.
                  // https://docs.ourbigbook.com/todo/links-to-synonym-header-have-fragment
                  sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
                ],
              },
              // Also get the synonyms of title-title.
              // Also tries to get synonyms of the other synonym and parent, but those never have them.
              include: [
                {
                  model: sequelize.models.Ref,
                  as: 'from',
                  where: {
                    type: { [sequelize.Sequelize.Op.or]: [
                      sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM],
                    ]},
                  },
                  required: false,
                  include: [
                    {
                      model: sequelize.models.Id,
                      as: 'to',
                      required: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
  } else {
    rows = []
  }
  return rows
}

/**
 * @param {string[]} starting_ids
 * @return {Object[]} Id-like objects sorted in breadth first order representing the
 *                    entire subtree of IDs under starting_ids, considering only
 *                    ourbigbook.REFS_TABLE_PARENT type refs.
 *
 *                    The IDs for the starting_ids are not present, only its children.
 *                    These children start at depth 0.
 */
async function fetch_header_tree_ids(sequelize, starting_ids, opts={}) {
  let {
    crossFileBoundaries,
    definedAtFileId,
    unreachableFiles,
    idAttrs,
    refPrefix,
    to_id_index_order,
    transaction,
  } = opts
  const { File, Id, Ref } = sequelize.models
  if (to_id_index_order === undefined) {
    to_id_index_order = 'ASC'
  }
  if (crossFileBoundaries === undefined) {
    crossFileBoundaries = true
  }
  if (idAttrs === undefined) {
    idAttrs = '*'
  }
  if (unreachableFiles === undefined) {
    unreachableFiles = false
  }
  if (unreachableFiles) {
    idAttrs = 'defined_at'
  }
  if (starting_ids.length > 0) {
    let definedAtString
    if (definedAtFileId) {
      definedAtString = ' AND "defined_at" = :definedAtFileId'
    } else {
      definedAtString = ''
    }
    let startingFileIds
    if (!crossFileBoundaries) {
      startingFileIds = (await Id.findAll({
        where: { idid: starting_ids },
        include: [{
          model: File,
          as: 'idDefinedAt',
        }]
      })).map(id => id.idDefinedAt.id)
    }
    // Fetch all data recursively.
    //
    // Going for WITH RECURSIVE:
    // https://stackoverflow.com/questions/192220/what-is-the-most-efficient-elegant-way-to-parse-a-flat-table-into-a-tree/192462#192462
    //
    // Sequelize doesn't support this of course.
    // - https://stackoverflow.com/questions/34135555/recursive-include-sequelize
    // - https://stackoverflow.com/questions/55091052/recursive-postgresql-query
    // - https://github.com/sequelize/sequelize/issues/4890
    // We could use one of the other constructs proposed besides WITH RECURSIVE,
    // but it would likely be less efficient and harder to implement. So just going
    // with this for now.
    ;const [rows, meta] = await sequelize.query(`
${unreachableFiles
  ? `SELECT "id", "path" FROM "${File.tableName}"\n` +
    `WHERE "toplevel_id" <> :refPrefix\n` +
    `AND "id" NOT IN (`
  : ''}
SELECT ${idAttrs} FROM "${Id.tableName}"
INNER JOIN (
  WITH RECURSIVE "tree_search" ("to_id", ${unreachableFiles ? '' : '"level", '}"from_id", "to_id_index") AS (
    SELECT
      "to_id",
      ${unreachableFiles ? '' : '0,'}
      "from_id",
      "to_id_index"
    FROM "${Ref.tableName}"
    WHERE "from_id" IN (:starting_ids) AND "type" = :type${definedAtString}

    UNION

    SELECT
      "t"."to_id",
      ${unreachableFiles ? '' : '"ts"."level" + 1,'}
      "ts"."to_id",
      "t"."to_id_index"
    FROM "${Ref.tableName}" "t", tree_search "ts"
    WHERE "t"."from_id" = "ts"."to_id" AND "type" = :type${definedAtString}
  )
  SELECT * FROM tree_search
) AS "RecRefs"
ON "${Id.tableName}".idid = "RecRefs"."to_id"
  AND "${Id.tableName}"."macro_name" = '${ourbigbook.Macro.HEADER_MACRO_NAME}'${crossFileBoundaries ? '' : `\n  AND "${Id.tableName}"."defined_at" IN (:startingFileIds)`}
${unreachableFiles ? ')' : `ORDER BY ${unreachableFiles ? '' : '"RecRefs"."level" ASC, '}"RecRefs"."from_id" ASC, "RecRefs"."to_id_index" ${to_id_index_order}`}
`,
      {
        replacements: {
          refPrefix,
          starting_ids,
          startingFileIds,
          type: Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          definedAtFileId,
        },
        transaction,
      }
    )
    return rows
  } else {
    return []
  }
}

/** DbProvider that fetches data from SQL queries directly.
 * Should work across different RDMSs (SQLite / PostgreSQL) due
 * to the use of an ORM (Sequelize) or portable queries/ifs.
 */
class SqlDbProvider extends web_api.DbProviderBase {
  constructor(sequelize) {
    super();
    this.sequelize = sequelize
  }

  async clear(input_paths, transaction) {
    const sequelize = this.sequelize
    const { File, Id, Ref } = sequelize.models
    return Promise.all([
      // TODO get rid of this when we start deleting files on CLI.
      // https://docs.ourbigbook.com/bigb-id-ref-and-file-foreign-normalization
      Id.findAll({
        where: {},
        include: [
          {
            model: File,
            as: 'idDefinedAt',
            required: true,
            where: { path: input_paths },
          },
        ],
        transaction
      }).then(ids => Id.destroy({ where: { id: ids.map(id => id.id ) }, transaction })),
      Ref.findAll({
        attributes: ['id'],
        include: [
          {
            model: File,
            as: 'definedAt',
            where: { path: input_paths },
            attributes: [],
          },
        ],
        transaction,
      }).then(ids => Ref.destroy({ where: { id: ids.map(id => id.id ) }, transaction })),
    ])
  }

  async clear_prefix(prefix) {
    let prefix_literal;
    if (prefix) {
      prefix_literal = prefix + ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + '%'
    } else {
      // Toplevel dir, delete all IDs.
      prefix_literal = '%'
    }
    const sequelize = this.sequelize
    const Op = sequelize.op
    const { File, Id, Ref } = sequelize.models
    return Promise.all([
      Id.destroy({
        where: {},
        include: [
          {
            model: File,
            as: 'idDefinedAt',
            required: true,
            where: { path: { [Op.like]: prefix_literal } }
          },
        ],
      }),
      Ref.findAll({
        attributes: ['id'],
        include: [
          {
            model: File,
            as: 'definedAt',
            where: { path: { [Op.like]: prefix_literal } },
            attributes: [],
          },
        ],
        transaction,
      }).then(ids => Ref.destroy({ where: { id: ids.map(id => id.id ) }, transaction })),
    ])
  }

  // Get all ASTs for the selected IDs.
  // @return Ast[]
  async get_noscopes_base_fetch(ids, ignore_paths_set, context) {
    const rows = await get_noscopes_base_fetch_rows(this.sequelize, ids, ignore_paths_set)
    return this.rows_to_asts(rows, context)
  }

  async get_refs_to_fetch(types, to_ids, { reversed, ignore_paths_set, context }) {
    if (reversed === undefined) {
      reversed = false
    }
    if (to_ids.length) {
      let to_id_key, other_key;
      if (reversed) {
        to_id_key = 'from_id'
        other_key = 'to_id'
      } else {
        to_id_key = 'to_id'
        other_key = 'from_id'
      }
      const include_key = other_key.split('_')[0]
      const where = {
        [to_id_key]: to_ids,
        type: types.map(type => this.sequelize.models.Ref.Types[type]),
      }
      const include = [
        {
          model: this.sequelize.models.Id,
          as: include_key,
          // https://github.com/ourbigbook/ourbigbook/issues/240
          include: [
            {
              model: this.sequelize.models.File,
              as: 'idDefinedAt',
              include: [{
                model: this.sequelize.models.Id,
                as: 'toplevelId',
              }]
            },
          ],
        }
      ]
      if (ignore_paths_set !== undefined) {
        const ignore_paths = Array.from(ignore_paths_set).filter(x => x !== undefined)
        include.push({
          model: this.sequelize.models.File,
          as: 'definedAt',
          where: {
            path: {
              [this.sequelize.Sequelize.Op.or]: [
                { [this.sequelize.Sequelize.Op.not]: ignore_paths },
                null
              ]
            }
          },
        })
      }
      const rows = await this.sequelize.models.Ref.findAll({
        where,
        attributes: [
          [other_key, 'id'],
          'defined_at',
          to_id_key,
          'type',
        ],
        include,
      })

      // Fetch files. In theory should be easily done on above query as JOIN,
      // but for some reason it is not working as mentioned on the TODO...
      for (const row of rows) {
        if (row[include_key]) {
          this.add_file_row_to_cache(row[include_key].idDefinedAt, context)
        }
      }
      //const file_paths = []
      //for (const row of rows) {
      //  if (row[include_key]) {
      //    file_paths.push(row[include_key].idDefinedAt.path)
      //  }
      //}
      //const file_rows = await this.sequelize.models.File.findAll({
      //  where: { path: file_paths },
      //  include: [
      //    {
      //      model: this.sequelize.models.Id,
      //      as: 'toplevelId',
      //    }
      //  ],
      //})
      //for (const file_row of file_rows) {
      //  this.add_file_row_to_cache(file_row, context)
      //}

      for (const row of rows) {
        this.add_ref_row_to_cache(row, to_id_key, include_key, context)
      }
      return rows
    }
  }

  get_refs_to(type, to_id, reversed=false) {
    let to_id_key, other_key;
    if (reversed) {
      to_id_key = 'from_id'
      other_key = 'to_id'
    } else {
      to_id_key = 'to_id'
      other_key = 'from_id'
    }
    // We don't even query the DB here to ensure that the warm is getting everything,
    // as part of our effort to centralize all queries at a single point.
    const ref_cache_to_id = this.ref_cache[to_id_key][to_id]
    if (ref_cache_to_id === undefined) {
      return []
    }
    const ret = ref_cache_to_id[this.sequelize.models.Ref.Types[type]]
    if (ret === undefined) {
      return []
    }
    return ret
  }

  // We have a separate function from fetch_header_tree_ids to defer after that call,
  // because we want to first fetch everything
  // and populate the ID cache with the include entry points that have proper header_tree_node.
  // Only then are we ready for linking up the rest of the tree.
  build_header_tree(fetch_header_tree_ids_rows, { context, toplevelHeaderTreeNode }) {
    const asts = []
    for (const row of fetch_header_tree_ids_rows) {
      const ast = this.row_to_ast(row, context)
      if (ast.synonym === undefined) {
        const parent_id = row.from_id
        const parent_ast = this.id_cache[parent_id]
        let parent_ast_header_tree_node
        if (parent_ast) {
          parent_ast_header_tree_node = parent_ast.header_tree_node
        }
        if (parent_ast_header_tree_node === undefined) {
          parent_ast_header_tree_node = toplevelHeaderTreeNode
        }
        ast.header_tree_node = new ourbigbook.HeaderTreeNode(ast, parent_ast_header_tree_node);
        // I love it when you get potential features like this for free.
        // Only noticed when Figures showed up on ToC.
        if (
          ast.macro_name === ourbigbook.Macro.HEADER_MACRO_NAME
        ) {
          // Can happen on error condition of pointing options.parent_id to self.
          // Blew up on web test "Circular parent loops to self fail gracefully."
          if (parent_ast_header_tree_node === undefined)  {
            if (toplevelHeaderTreeNode) {
              toplevelHeaderTreeNode.add_child(ast.header_tree_node);
            }
          } else {
            parent_ast_header_tree_node.add_child(ast.header_tree_node);
          }
        }
        ourbigbook.propagateNumbered(ast, context)
        this.id_cache[ast.id] = ast
        asts.push(ast)
      }
    }
    return asts
  }

  async fetch_header_tree_ids(starting_ids, opts={}) {
    return fetch_header_tree_ids(this.sequelize, starting_ids, opts)
  }

  // Recursively fetch all ancestors of a given ID from the database.
  async fetch_ancestors(toplevel_id) {
    if (toplevel_id) {
      ;const [rows, meta] = await this.sequelize.query(`
SELECT * FROM "${this.sequelize.models.Id.tableName}"
INNER JOIN (
WITH RECURSIVE
  tree_search (to_id, level, from_id) AS (
    SELECT
      to_id,
      0,
      from_id
    FROM "${this.sequelize.models.Ref.tableName}"
    WHERE to_id = :toplevel_id AND type = :type

    UNION ALL

    SELECT
      ts.from_id,
      ts.level + 1,
      t.from_id
    FROM "${this.sequelize.models.Ref.tableName}" t, tree_search ts
    WHERE t.to_id = ts.from_id AND type = :type
  )
  SELECT * FROM tree_search
) AS "RecRefs"
ON "${this.sequelize.models.Id.tableName}".idid = "RecRefs"."from_id"
ORDER BY "RecRefs".level DESC
`,
        { replacements: {
          toplevel_id,
          type: this.sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
        } }
      )
      return rows
    } else {
      return []
    }
  }

  fetch_ancestors_build_tree(rows, context) {
    const asts = []
    let parent_ast
    for (const row of rows) {
      let ast = this.id_cache[row.idid]
      if (!ast) {
        ast = this.add_row_to_id_cache(row, context)
      }
      if (ast.synonym === undefined) {
        let parent_ast_header_tree_node
        if (parent_ast) {
          parent_ast_header_tree_node = parent_ast.header_tree_node
        }
        ast.header_tree_node = new ourbigbook.HeaderTreeNode(ast, parent_ast_header_tree_node);
        if (parent_ast) {
          parent_ast_header_tree_node.add_child(ast.header_tree_node);
        }
        ourbigbook.propagateNumbered(ast, context)
        parent_ast = ast
      }
    }
    return asts
  }

  // Update the databases based on the output of the Ourbigbook conversion.
  // This updates the tables:
  // * Id
  // * Ref
  async update(ourbigbook_extra_returns, sequelize, transaction, opts={}) {
    const { newFile, synonymHeaderPaths } = opts
    const context = ourbigbook_extra_returns.context
    // Remove all IDs from the converted files to ensure that removed IDs won't be
    // left over hanging in the database.
    await this.clear(Array.from(context.options.include_path_set).concat(synonymHeaderPaths), transaction);

    // Calculate create_ids
    const ids = ourbigbook_extra_returns.ids;
    const create_ids = []
    for (const id in ids) {
      const ast = ids[id];
      create_ids.push({
        idid: id,
        defined_at: newFile.id,
        ast_json: JSON.stringify(ast),
        macro_name: ast.macro_name,
        toplevel_id: ast.toplevel_id,
      })
    }

    // calculate refs
    const refs = []
    // We only need to inspect the false because the information is redundant with the true,
    // it is only a primitive indexing mechanism.
    for (const to_id in context.refs_to[false]) {
      const types = context.refs_to[false][to_id];
      for (const type in types) {
        const from_ids = types[type];
        for (const from_id in from_ids) {
          if (
            // TODO happens on OurBigBookExample, likely also include,
            // need to fix and remove this if.
            from_id !== undefined
          ) {
            const ref_props = from_ids[from_id];
            const defined_ats = ref_props.defined_at
            for (const defined_at in defined_ats) {
              for (const { line: defined_at_line, column: defined_at_col, inflected } of defined_ats[defined_at]) {
                refs.push({
                  from_id,
                  defined_at: newFile.id,
                  defined_at_line,
                  defined_at_col,
                  to_id_index: ref_props.child_index,
                  to_id,
                  type: sequelize.models.Ref.Types[type],
                  inflected,
                })
              }
            }
          }
        }
      }
    }

    return Promise.all([
      sequelize.models.Id.bulkCreate(create_ids, { transaction }),
      sequelize.models.Ref.bulkCreate(refs, { transaction }),
    ])
  }

  async fetch_files(path, context) {
    const rows = await this.sequelize.models.File.findAll({
      where: { path },
      // We need to fetch these for toplevel scope removal.
      include: [{
        model: this.sequelize.models.Id,
        as: 'toplevelId',
      }],
    })
    for (const row of rows) {
      this.add_file_row_to_cache(row, context)
    }
  }
}

async function createSequelize(db_options, sync_opts={}) {
  db_options = Object.assign({ timestamps: false }, db_options, DB_OPTIONS)
  const storage = db_options.storage
  delete db_options.storage
  let sequelize
  if (ourbigbook_nodejs_front.postgres) {
    Object.assign(
      db_options,
      ourbigbook_nodejs_front.sequelize_postgres_opts,
    )
    sequelize = new Sequelize('postgres://ourbigbook_user:a@localhost:5432/ourbigbook_cli', db_options)
  } else {
    if (storage !== SQLITE_MAGIC_MEMORY_NAME) {
      const db_dir = path.dirname(storage);
      if (!fs.existsSync(db_dir)) {
        fs.mkdirSync(db_dir, { recursive: true });
      }
    }
    Object.assign(db_options,
      {
        dialect: 'sqlite',
        storage,
      },
      db_options,
    )
    sequelize = new Sequelize(db_options)
  }
  models.addModels(sequelize, { cli: true })
  if (
    db_options.dialect !== 'sqlite' ||
    storage === SQLITE_MAGIC_MEMORY_NAME ||
    (storage && !fs.existsSync(storage))
  ) {
    await sequelize.sync(sync_opts)
  }
  return sequelize
}

async function destroy_sequelize(sequelize) {
  return sequelize.close()
}

// Update the database after converting each separate file.
// This updates the tables:
// * Id
// * Ref
// * File
// * Render
async function update_database_after_convert({
  authorId,
  bodySource,
  extra_returns,
  db_provider,
  had_error,
  is_render_after_extract,
  non_ourbigbook_options,
  renderType,
  path,
  render, // boolean
  sequelize,
  synonymHeaderPaths,
  hash,
  transaction,
  titleSource,
  updateHash,
}) {
  const context = extra_returns.context;
  if (non_ourbigbook_options === undefined) {
    non_ourbigbook_options = {}
  }
  if (non_ourbigbook_options.commander === undefined) {
    non_ourbigbook_options.commander = {}
  }
  if (renderType === undefined) {
    renderType = ourbigbook.OUTPUT_FORMAT_HTML
  }
  if (updateHash === undefined) {
    updateHash = true
  }
  ourbigbook.perfPrint(context, 'convert_path_pre_sqlite_transaction')
  let toplevel_id;
  if (context.toplevel_ast !== undefined) {
    toplevel_id = context.toplevel_ast.id;
  }

  const file_bulk_create_opts = {}
  let file_bulk_create_last_parse
  if (extra_returns.errors.length > 0) {
    file_bulk_create_last_parse = null
    file_bulk_create_opts.ignoreDuplicates = true
  } else {
    file_bulk_create_opts.updateOnDuplicate = [
      'titleSource',
      'bodySource',
      'last_parse',
      // https://github.com/ourbigbook/ourbigbook/issues/241
      'toplevel_id',
    ]
    if (updateHash) {
      file_bulk_create_opts.updateOnDuplicate.push('hash')
    }
    file_bulk_create_last_parse = Date.now()
  }

  // This was the 80% bottleneck at Ourbigbook f8fc9eacfa794b95c1d9982a04b62603e6d0bb83
  // before being converted to a single transaction!
  // Likely would not have been a bottleneck if we new more about databases/had more patience
  // and instead of doing INSERT one by one we would do a single insert with a bunch of data.
  // The move to Sequelize made that easier with bulkCreate. But keeping the transaction just in case
  let newFile
  await sequelize.transaction({ transaction }, async (transaction) => {
    file_bulk_create_opts.transaction = transaction
     await sequelize.models.File.bulkCreate(
      [
        {
          authorId,
          bodySource,
          last_parse: file_bulk_create_last_parse,
          path,
          hash,
          titleSource,
          toplevel_id,
        },
      ],
      file_bulk_create_opts,
    )
    newFile = await sequelize.models.File.findOne({ where: { path }, transaction})
    const promises = []
    if (
      // This is not just an optimization, but actually required, because otherwise the second database
      // update would override \x magic plural/singular check_db removal.
      !is_render_after_extract
    ) {
      promises.push(db_provider.update(
        extra_returns,
        sequelize,
        transaction,
        {
          newFile,
          synonymHeaderPaths,
        }
      ))
    }
    await Promise.all(promises)
    // Re-find here until SQLite RETURNING gets used by sequelize.
    const file = await sequelize.models.File.findOne({ where: { path }, transaction })
    if (!render) {
      // Mark all existing renderings as outdated.
      await sequelize.models.Render.update(
        {
          outdated: true,
        },
        {
          where: {
            fileId: file.id,
          },
          transaction,
        }
      )
    }
    // Create a rendering for the current type if one does not exist.
    await sequelize.models.Render.upsert(
      {
        outdated: !render || !!had_error,
        type: sequelize.models.Render.Types[renderType],
        fileId: file.id,
      },
      {
        transaction,
      }
    )
  });
  ourbigbook.perfPrint(context, 'convert_path_post_sqlite_transaction')
  return { file: newFile }
}

/** Do various post ID extraction checks to verify database integrity after the database is updated by the ID extraction step:
 *
 * - refs to IDs that don't exist
 * - duplicate IDs
 * - https://docs.ourbigbook.com/x-within-title-restrictions
 *
 * This step should be run after all ID extraction are finished, and before render start.
 *
 * Previously these were done inside ourbigbook.convert. But then we started skipping render by timestamp,
 * so if you e.g. move an ID from one file to another, a common operation, then it would still see
 * the ID in the previous file depending on conversion order. So we are moving it here instead at the end.
 * Having this single query at the end also be slightly more efficient than doing each query separately per file conversion.
 *
 * Quite shorthandly, this also modifies the database by deleting unused flexion references, and therefore must be called
 * before render for a correct conversion. I wasted 2 hours of my life by forgetting that.
 */
async function check_db(sequelize, paths_converted, opts={}) {
  // * delete unused xrefs in different files to correctly have tags and incoming links in such cases
  //   https://github.com/ourbigbook/ourbigbook/issues/229
  //   These can happen due to:
  //   * directory based scopes
  //   * \x magic pluralization variants
  // * ensure that all \x targets exist
  let { perf, options, ref_prefix, transaction, web } = opts
  if (ref_prefix === undefined) {
    ref_prefix = ''
  }
  if (options === undefined) {
    options = {}
  }
  const { Op } = sequelize.Sequelize
  const { File, Id, Ref } = sequelize.models
  let t0
  if (perf) {
    t0 = performance.now();
    console.error('perf: check_db.start');
  }
  const dontLintFilesAreIncluded =
    web ||
    (
      options.ourbigbook_json !== undefined &&
      options.ourbigbook_json.lint !== undefined &&
      !options.ourbigbook_json.lint.filesAreIncluded
    )
  const [
    new_refs,
    doubleParents,
    noParents,
    unreachableFiles,
    duplicate_rows,
    invalid_title_title_rows,
  ] = await Promise.all([
    Ref.findAll({
      order: [
        ['defined_at', 'ASC'],
        ['defined_at_line', 'ASC'],
        ['defined_at_col', 'ASC'],
        ['type', 'ASC'],
        ['inflected', 'ASC'],
        // Longest matching scope first, we then ignore all others.
        [sequelize.fn('length', sequelize.col('to_id')), 'DESC'],
      ],
      include: [
        {
          model: Id,
          as: 'to',
          attributes: ['id'],
        },
        {
          model: Id,
          as: 'from',
          attributes: ['id'],
        },
        Object.assign(
          {
            model: File,
            as: 'definedAt',
          },
          paths_converted === undefined ? {} : { where: { path: paths_converted } }
        )
      ],
      transaction,
    }),
    // doubleParents
    web
      ? []
      : Ref.findAll({
          where: {
            type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
          },
          include: [
            {
              model: Ref,
              as: 'duplicate',
              required: true,
              on: {
                '$Ref.to_id$': { [Op.col]: 'duplicate.to_id' },
                '$Ref.id$': { [Op.ne]: { [Op.col]: 'duplicate.id' } },
                type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
              },
              include: [
                {
                  model: File,
                  as: 'definedAt',
                  required: true,
                },
                {
                  model: Id,
                  as: 'to',
                },
                {
                  model: Id,
                  as: 'from',
                },
              ],
            },
            Object.assign(
              {
                model: File,
                as: 'definedAt',
                required: true,
              },
              paths_converted === undefined ? {} : { where: { path: paths_converted } }
            ),
            {
              model: Id,
              as: 'to',
            },
            {
              model: Id,
              as: 'from',
            },
          ],
          order: [
            [sequelize.col('definedAt.path'), 'ASC'],
          ],
          transaction,
        })
    ,
    // noParents
    dontLintFilesAreIncluded
      ? []
      : Id.findAll({
          include: [
            {
              model: Ref,
              as: 'to',
              required: false,
              where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT] },
            },
            {
              model: Ref,
              as: 'from',
              required: false,
              where: { type: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_SYNONYM] },
            },
            {
              model: File,
              as: 'idDefinedAt',
              required: true,
            },
          ],
          where: {
            idid: { [Op.ne]: ref_prefix },
            '$to.id$': null,
            // Ignore synonyms.
            '$from.id$': null,
          }
        })
    ,
    // unreachableFiles
    // It is not ideal to skip this check here as it means that we can have 
    // infinite loops if filesAreIncluded check is disabled by user
    // on ourbigbook.json. But good enough for now.
    // https://github.com/ourbigbook/ourbigbook/issues/204
    dontLintFilesAreIncluded
      ? []
      : fetch_header_tree_ids(
          sequelize,
          [ref_prefix],
          {
            unreachableFiles: true,
            idAttrs: ['defined_at'],
            refPrefix: ref_prefix,
            transaction,
          },
        )
    ,
    Id.findDuplicates(paths_converted, transaction),
    Id.findInvalidTitleTitle(paths_converted, transaction),
  ])
  if (perf) {
    console.error(`perf: check_db.after_finds: ${performance.now() - t0} ms`);
  }
  const error_messages = []

  // Check that each link has at least one hit for the available magic inflections if any.
  // If there are multiple matches pick the one that is either:
  // - on the longest scope
  // - if there's a draw on scope length, prefer the non inflected one
  // TODO maybe it is possible to do this in a single query. But I'm not smart enough.
  // So just doing some Js code and an extra deletion query afterwards
  let i = 0
  const delete_unused_inflection_ids = []
  //console.dir(new_refs.map((r, i) => { return {
  //  i,
  //  defined_at: r.defined_at,
  //  defined_at_line: r.defined_at_line,
  //  defined_at_col: r.defined_at_col,
  //  from_id: r.from_id,
  //  to_id: r.to_id,
  //  type: r.type,
  //  inflected: r.inflected,
  //} }), { maxArrayLength: null } );
  while (i < new_refs.length) {
    let new_ref = new_refs[i]
    let new_ref_next = new_ref
    let not_inflected_match_local_idx, inflected_match_local_idx, not_inflected_match_global_idx, inflected_match_global_idx
    do {
      let do_delete = true
      let not_inflected_idx = 0
      let inflected_idx = 0
      if (new_ref_next.inflected) {
        if (
          inflected_match_global_idx === undefined &&
          new_ref_next.to &&
          new_ref_next.from
        ) {
          inflected_match_global_idx = i
          inflected_match_local_idx = inflected_idx
          do_delete = false
        }
        inflected_idx++
      } else if (inflected_match_global_idx === undefined) {
        shortest_not_inflected_ref = new_ref_next
        if (
          not_inflected_match_global_idx === undefined &&
          new_ref_next.to &&
          new_ref_next.from
        ) {
          not_inflected_match_global_idx = i
          not_inflected_match_local_idx = not_inflected_idx
          do_delete = false
        }
        not_inflected_idx++
      }
      if (do_delete) {
        //console.error(`do_delete ${i} ${new_refs[i].from_id} -> ${new_refs[i].to_id}`);
        delete_unused_inflection_ids.push(new_ref_next.id)
      }
      i++
      new_ref_next = new_refs[i]
    } while (
      new_ref_next &&
      new_ref.definedAt.path  === new_ref_next.definedAt.path &&
      new_ref.defined_at_line === new_ref_next.defined_at_line &&
      new_ref.defined_at_col  === new_ref_next.defined_at_col &&
      new_ref.type            === new_ref_next.type
    )

    // Select between inflected and non-inflected since both match.
    if (
      not_inflected_match_global_idx !== undefined &&
      inflected_match_global_idx !== undefined
    ) {
      let delete_idx
      if (inflected_match_local_idx < not_inflected_match_local_idx) {
        delete_idx = not_inflected_match_global_idx
      } else {
        delete_idx = inflected_match_global_idx
      }
      delete_unused_inflection_ids.push(new_refs[delete_idx].id)
    }

    // No matches, so error.
    if (
      not_inflected_match_global_idx === undefined &&
      inflected_match_global_idx === undefined
    ) {
      let to
      if (
        // Happens on undefined tags.
        // https://docs.ourbigbook.com/todo/undefined-tag-error-message-for-directory-conversion-says-header-id-is-not-defined-instead-of-tag-id
        shortest_not_inflected_ref.type === sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_X_CHILD]
      ) {
        to = shortest_not_inflected_ref.from_id
      } else {
        to = shortest_not_inflected_ref.to_id
      }
      error_messages.push(
        `${new_ref.definedAt.path}:${new_ref.defined_at_line}:${new_ref.defined_at_col}: internal link ${ourbigbook.ESCAPE_CHAR}${ourbigbook.Macro.X_MACRO_NAME} to unknown id: "${to}"`
      )
    }
  }
  if (delete_unused_inflection_ids.length) {
    await sequelize.models.Ref.destroy({ where: { id: delete_unused_inflection_ids }, transaction })
  }

  if (duplicate_rows.length > 0) {
    for (const duplicate_row of duplicate_rows) {
      const ast = ourbigbook.AstNode.fromJSON(duplicate_row.ast_json)
      const source_location = ast.source_location
      const other_ast = ourbigbook.AstNode.fromJSON(duplicate_row.duplicate[0].ast_json)
      const other_source_location = other_ast.source_location
      error_messages.push(
        `${source_location.path}:${source_location.line}:${source_location.column}: duplicated ID: "${duplicate_row.idid}". Previous definition at: ${other_source_location.path}:${other_source_location.line}:${other_source_location.column}`
      )
    }
  }
  if (invalid_title_title_rows.length > 0) {
    for (const invalid_title_title_row of invalid_title_title_rows) {
      const ast = ourbigbook.AstNode.fromJSON(invalid_title_title_row.ast_json)
      const source_location = ast.source_location
      error_messages.push(
        `${source_location.path}:${source_location.line}:${source_location.column}: cannot \\x link from a title to a non-header element: https://docs.ourbigbook.com/x-within-title-restrictions`
      )
    }
  }
  if (noParents.length > 0) {
    for (const id of noParents) {
      error_messages.push(
        `ID "${id.idid}" defined in file "${id.idDefinedAt.path}" has no parent and won't show on the toplevel table of contents, and is not Web uploadable, make sure to either include that file from another file with \\Include https://docs.ourbigbook.com/#include or add it to your ignored files: https://docs.ourbigbook.com/#ourbigbook-json/ignore`
      )
    }
  } else {
    // Only check for reachability when there are no files without parent.
    // Otherwise, e.g. if we have aaa.bigb without parent and Include chain:
    // aaa.bigb -> bbb.bigb -> ccc.bigb
    // then this error would give three possible paths, which is less precise and more confusing.
    // This check exists only to prevent cycling includes: https://github.com/ourbigbook/ourbigbook/issues/204
    // e.g. such as:
    // aaa.bigb -> bbb.bigb -> ccc.bigb -> aaa.bigb
    // because in that case all files have a parent, but we have a loop. But because double parent
    // is also forbidden, this can only happen if there is a loop.
    if (unreachableFiles.length) {
      error_messages.push(
        `the following files cannot be reached from the toplevel index file via ` +
        `${ourbigbook.ESCAPE_CHAR}${ourbigbook.Macro.INCLUDE_MACRO_NAME}, ` +
        `did you forget some ${ourbigbook.ESCAPE_CHAR}${ourbigbook.Macro.INCLUDE_MACRO_NAME}? ` +
        unreachableFiles.map(f => `"${f.path}"`).join(', ')
      )
    }
  }
  if (doubleParents.length > 0) {
    for (const ref of doubleParents) {
      const new_ref = ref
      const oldRef = ref.duplicate[0]
      error_messages.push(
        `ID "${new_ref.to.idid}" has two parents: ` +
        `"${new_ref.from.idid}" defined at ${new_ref.definedAt.path}:${new_ref.defined_at_line}:${new_ref.defined_at_col} and ` +
        `"${oldRef.from.idid}" defined at ${oldRef.definedAt.path}:${oldRef.defined_at_line}:${oldRef.defined_at_col}`
      )
    }
  }
  if (perf) {
    console.error(`perf: check_db.finish: ${performance.now() - t0} ms`);
  }
  return error_messages
}

function preload_katex_from_file(tex_path, katex_macros) {
  if (katex_macros === undefined) {
    katex_macros = {}
  }
  katex_macros = ourbigbook_nodejs_front.preload_katex(
    fs.readFileSync(tex_path, ENCODING),
    katex_macros,
  )
  return katex_macros
}

// https://stackoverflow.com/questions/9355403/deleting-duplicates-on-sorted-array/61974900#61974900
function remove_duplicates_sorted_array(arr) {
  return arr.filter((e, i, a) => e !== a[i - 1]);
}

// on: 'insert', 'delete', 'update'
// action: SQL statement string with what must be done
// after: 'BEFORE' or 'AFTER'
// when: SQL statement string that goes in WHEN ( <when> )
async function sequelizeCreateTrigger(sequelize, model, on, action, { after, when, nameExtra } = {}) {
  if (after === undefined) {
    after = 'AFTER'
  }
  if (nameExtra) {
    nameExtra = `_${nameExtra})`
  } else {
    nameExtra = ''
  }
  const oldnew = on === 'delete' ? 'OLD' : 'NEW'
  const triggerName = `${model.tableName}_${on}${nameExtra}`
  if (when) {
    when = `\n  WHEN (${when})`
  } else {
    when = ''
  }
  if (sequelize.options.dialect === 'postgres') {
    const functionName = `${triggerName}_fn`
    await sequelize.query(`CREATE OR REPLACE FUNCTION "${functionName}"()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
  AS
$$
BEGIN
  ${action};
  RETURN ${oldnew};
END;
$$
`)
    // CREATE OR REPLACE TRIGGER was only added on postgresql 14 so let's be a bit more portable for now:
    // https://stackoverflow.com/questions/35927365/create-or-replace-trigger-postgres
    await sequelize.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "${model.tableName}"`)
    await sequelize.query(`CREATE TRIGGER ${triggerName}
  ${after} ${on.toUpperCase()}
  ON "${model.tableName}"
  FOR EACH ROW${when}
  EXECUTE PROCEDURE "${functionName}"();
`)
  } else if (sequelize.options.dialect === 'sqlite') {
    await sequelize.query(`
CREATE TRIGGER IF NOT EXISTS ${triggerName}
  ${after} ${on.toUpperCase()}
  ON "${model.tableName}"
  FOR EACH ROW${when}
  BEGIN
    ${action};
  END;
`)
  }
}

/** Create triggers to keep counts such as user likes article counts on article table in sync. */
async function sequelizeCreateTriggerUpdateCount(sequelize, articleTable, likeTable, articleTableCountField, likeTableArticleIdField) {
  const articleTableName = articleTable.tableName
  await sequelizeCreateTrigger(sequelize, likeTable, 'insert',
    `UPDATE "${articleTableName}" SET "${articleTableCountField}" = "${articleTableCountField}" + 1 WHERE NEW."${likeTableArticleIdField}" = "${articleTableName}"."id"`
  ),
  await sequelizeCreateTrigger(sequelize, likeTable, 'delete',
    `UPDATE "${articleTableName}" SET "${articleTableCountField}" = "${articleTableCountField}" - 1 WHERE OLD."${likeTableArticleIdField}" = "${articleTableName}"."id"`
  ),
  await sequelizeCreateTrigger(
    // I don't think this will ever happen, only insert/deletion. But still let's define it just in case.
    sequelize,
    likeTable,
    'update',
    `UPDATE "${articleTableName}" SET "${articleTableCountField}" = "${articleTableCountField}" + 1 WHERE NEW."${likeTableArticleIdField}" = "${articleTableName}"."id";\n` +
    `UPDATE "${articleTableName}" SET "${articleTableCountField}" = "${articleTableCountField}" - 1 WHERE OLD."${likeTableArticleIdField}" = "${articleTableName}"."id"`
    ,
    {
      when: `OLD."${likeTableArticleIdField}" <> NEW."${likeTableArticleIdField}"`,
    }
  )
}

/** Safely consume a user provided query string to a prefix search tsquery Sequelize literal.
 * For example, 'rabbit bee' gets converted to 'rabbit & bee:*' and therefore matches strings
 * that contain both the full word "rabbit" and the prefix bee.*.
 * https://stackoverflow.com/questions/16020164/psqlexception-error-syntax-error-in-tsquery/79437030#79437030
 */
function sequelizePostgresqlUserQueryToTsqueryPrefixLiteral(sequelize, q) {
  return sequelize.literal(
    `regexp_replace(plainto_tsquery('${ID_FTS_POSTGRESL_LANGUAGE}', ${sequelize.escape(q)})::text || ':*', '^..$', '')::tsquery`
  )
}

function findOurbigbookJsonDir(curdir, opts={}) {
  const { fakeroot } = opts
  while (true) {
    const ourbigbook_json_path = path.join(curdir, ourbigbook.OURBIGBOOK_JSON_BASENAME)
    if (fs.existsSync(ourbigbook_json_path)) {
      return curdir
    }
    if (
      curdir === path.parse(curdir).root ||
      curdir === fakeroot
    ) {
      return
    }
    curdir = path.dirname(curdir)
  }
}

/** Iterate over multiple paginated calls to avoid overloading
 * server memory when there can be too many results.
 * https://stackoverflow.com/questions/57164242/perform-sequelize-findall-in-a-huge-array
 */
async function *sequelizeIterateOverPagination(fetchFunc, fetchFuncArgs, limit) {
  let offset = 0
  let rows
  do {
    rows = await fetchFunc({ ...fetchFuncArgs, offset, limit })
    if (rows.length === 0)
      return
    for (const row of rows)
      yield row
    offset += limit
  } while (true)
}

module.exports = {
  SqlDbProvider,
  check_db,
  createSequelize,
  DB_OPTIONS,
  destroy_sequelize,
  ENCODING,
  fetch_header_tree_ids,
  findOurbigbookJsonDir,
  get_noscopes_base_fetch_rows,
  ID_FTS_POSTGRESL_LANGUAGE,
  preload_katex_from_file,
  remove_duplicates_sorted_array,
  sequelizeCreateTrigger,
  sequelizeCreateTriggerUpdateCount,
  sequelizeIterateOverPagination,
  sequelizePostgresqlUserQueryToTsqueryPrefixLiteral,
  update_database_after_convert,
  SQLITE_MAGIC_MEMORY_NAME,
  TMP_DIRNAME: ourbigbook.Macro.RESERVED_ID_PREFIX + 'out',
  DIST_BASENAME: 'dist',
}
