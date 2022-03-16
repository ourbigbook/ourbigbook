// TODO I don't know why, but webpack was failing with:
//   Error: Cannot find module 'cirodown/package.json'
// at:
//   const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')));
// from nodejs.js. Just splitting this out here until I find the patience to
// minimize and resolve that bs.

// We cannot require sequelize here, because otherwise the web/ version blows up due to missing postgres,
// which is a peer dependency of sequelize that we don't need for the CLI converter, as we use SQLite there.

const fs = require('fs');
const path = require('path');

const cirodown = require('cirodown');
const models = require('cirodown/models')

// DB options that have to be given to both cirodown CLI and dynamic website.
// These must be used for both for consistency, e.g. freezeTableName would lead
// to different able names in the database, which could break manually written queries.
// Yes, we could work around that by using model properties like models.Id.tableName,
// but having different tables in both cases would be too insane.
const db_options = {
  define: {
    freezeTableName: true,
  },
}

class SqliteIdProvider extends cirodown.IdProvider {
  constructor(sequelize) {
    super();
    this.sequelize = sequelize
    this.id_cache = {}
    this.ref_cache = {
      from_id: {},
      to_id: {},
    }
  }

  async clear(input_paths, transaction) {
    return Promise.all([
      this.sequelize.models.Id.destroy({ where: { path: input_paths }, transaction }),
      this.sequelize.models.Ref.destroy({ where: { defined_at: input_paths }, transaction }),
    ])
  }

  async clear_prefix(prefix) {
    let prefix_literal;
    if (prefix) {
      prefix_literal = prefix + cirodown.Macro.HEADER_SCOPE_SEPARATOR + '%'
    } else {
      // Toplevel dir, delete all IDs.
      prefix_literal = '%'
    }
    return Promise.all([
      this.sequelize.models.Id.destroy({ where: { path: { [this.sequelize.Sequelize.Op.like]: prefix_literal } } }),
      this.sequelize.models.Ref.destroy({ where: { defined_at: { [this.sequelize.Sequelize.Op.like]: prefix_literal } } }),
    ])
  }

  add_row_to_id_cache(row, context) {
    if (row !== null) {
      const ast = this.row_to_ast(row, context)
      if (
        // Possible on reference to ID that does not exist and some other
        // non error cases I didn't bother to investigate.
        row.to !== undefined
      ) {
        ast.header_parent_ids = row.to.map(to => to.from_id)
      }
      this.id_cache[ast.id] = ast
      return ast
    }
  }

  async get_noscopes_base_fetch(ids, ignore_paths_set, context) {
    const asts = []
    if (ids.length) {
      const where = {
        idid: ids,
      }
      if (ignore_paths_set !== undefined) {
        const ignore_paths = Array.from(ignore_paths_set).filter(x => x !== undefined)
        where.path = { [this.sequelize.Sequelize.Op.not]: ignore_paths }
      }
      const rows = await this.sequelize.models.Id.findAll({
        where,
        include: [
          {
            model: this.sequelize.models.Ref,
            as: 'to',
            where: { type: this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT] },
            required: false,
          },
          {
            model: this.sequelize.models.Ref,
            as: 'from',
            where: {
              type: { [this.sequelize.Sequelize.Op.or]: [
                this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT],
                this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_X_TITLE_TITLE],
              ]}
            },
            required: false,
            include: [
              {
                model: this.sequelize.models.Id,
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
                  '$from.to_id$': {[this.sequelize.Sequelize.Op.col]: 'from->to.idid' },
                  // This gets only the TITLE TITLE.
                  '$from.type$': this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_X_TITLE_TITLE],
                }
              }
            ]
          },
        ],
      })
      for (const row of rows) {
        asts.push(this.add_row_to_id_cache(row, context))
        for (const row_title_title of row.from) {
          if (
            // We need this check because the version of the header it fetches does not have .to
            // so it could override one that did have the .to, and then other things could blow up.
            !(row_title_title.to && row_title_title.to.idid in this.id_cache)
          ) {
            const ret = this.add_row_to_id_cache(row_title_title.to, context)
            if (ret !== undefined) {
              asts.push(ret)
            }
          }
        }
      }
    }
    return asts
  }

  get_noscopes_base(ids, ignore_paths_set) {
    const cached_asts = []
    for (const id of ids) {
      if (id in this.id_cache) {
        const ast = this.id_cache[id]
        if (
          ignore_paths_set === undefined ||
          !ignore_paths_set.has(ast.input_path)
        ) {
          cached_asts.push(ast)
        }
      }
    }
    return cached_asts
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
      if (ignore_paths_set !== undefined) {
        const ignore_paths = Array.from(ignore_paths_set).filter(x => x !== undefined)
        where.defined_at = { [this.sequelize.Sequelize.Op.not]: ignore_paths }
      }
      const rows = await this.sequelize.models.Ref.findAll({
        where,
        attributes: [
          [other_key, 'id'],
          'defined_at',
          to_id_key,
          'type',
        ],
        include: [
          {
            model: this.sequelize.models.Id,
            as: include_key,
          }
        ]
      })
      for (const row of rows) {
        let to_id_key_dict = this.ref_cache[to_id_key][row[to_id_key]]
        if (to_id_key_dict === undefined) {
          to_id_key_dict = {}
          this.ref_cache[to_id_key][row[to_id_key]] = to_id_key_dict
        }
        let to_id_key_dict_type = to_id_key_dict[row.type]
        if (to_id_key_dict_type === undefined) {
          to_id_key_dict_type = []
          to_id_key_dict[row.type] = to_id_key_dict_type
        }
        to_id_key_dict_type.push(row)
        this.add_row_to_id_cache(row[include_key], context)
      }
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
  build_header_tree(fetch_header_tree_ids_rows, { context }) {
    const asts = []
    for (const row of fetch_header_tree_ids_rows) {
      const ast = this.row_to_ast(row, context)
      if (ast.synonym === undefined) {
        const parent_id = row.from_id
        const parent_ast = this.id_cache[parent_id]
        const parent_ast_header_tree_node = parent_ast.header_tree_node
        ast.header_tree_node = new cirodown.HeaderTreeNode(ast, parent_ast_header_tree_node);
        // I love it when you get potential features like this for free.
        // Only noticed when Figures showed up on ToC.
        if (ast.macro_name === cirodown.Macro.HEADER_MACRO_NAME) {
          parent_ast_header_tree_node.add_child(ast.header_tree_node);
        }
        cirodown.propagate_numbered(ast, context)
        this.id_cache[ast.id] = ast
        asts.push(ast)
      }
    }
    return asts
  }

  async fetch_header_tree_ids(starting_ids_to_asts) {
    const starting_ids = Object.keys(starting_ids_to_asts)
    if (starting_ids.length > 0) {
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
      ;const [rows, meta] = await this.sequelize.query(`SELECT * FROM "${this.sequelize.models.Id.tableName}"
INNER JOIN (
WITH RECURSIVE
  tree_search (to_id, level, from_id, to_id_index) AS (
    SELECT
      to_id,
      0,
      from_id,
      to_id_index
    FROM "${this.sequelize.models.Ref.tableName}"
    WHERE from_id IN (:starting_ids) AND type = :type

    UNION ALL

    SELECT
      t.to_id,
      ts.level + 1,
      ts.to_id,
      t.to_id_index
    FROM "${this.sequelize.models.Ref.tableName}" t, tree_search ts
    WHERE t.from_id = ts.to_id AND type = :type
  )
  SELECT * FROM tree_search
  ORDER BY level, from_id, to_id_index
) AS "RecRefs"
ON "${this.sequelize.models.Id.tableName}".idid = "RecRefs"."to_id"
`,
        { replacements: {
          starting_ids,
          type: this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT],
        } }
      )
      return rows
    } else {
      return []
    }
  }

  // Recursively fetch all ancestors of a given ID from the database.
  async fetch_ancestors(toplevel_id) {
    if (toplevel_id) {
      ;const [rows, meta] = await this.sequelize.query(`SELECT * FROM "${this.sequelize.models.Id.tableName}"
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
    ORDER BY level DESC
  ) AS "RecRefs"
  ON "${this.sequelize.models.Id.tableName}".idid = "RecRefs"."from_id"
  `,
        { replacements: {
          toplevel_id,
          type: this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT],
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
        ast.header_tree_node = new cirodown.HeaderTreeNode(ast, parent_ast_header_tree_node);
        if (parent_ast) {
          if (ast.macro_name === cirodown.Macro.HEADER_MACRO_NAME) {
            parent_ast_header_tree_node.add_child(ast.header_tree_node);
          }
        }
        cirodown.propagate_numbered(ast, context)
        parent_ast = ast
      }
    }
    return asts
  }

  row_to_ast(row, context) {
    const ast = cirodown.AstNode.fromJSON(row.ast_json, context)
    ast.input_path = row.path
    ast.id = row.idid
    return ast
  }

  // Update the databases based on the output of the Cirodown conversion.
  async update(cirodown_extra_returns, sequelize, transaction) {
    const context = cirodown_extra_returns.context
    // Remove all IDs from the converted files to ensure that removed IDs won't be
    // left over hanging in the database.
    await this.clear(Array.from(context.options.include_path_set), transaction);

    // Calculate create_ids
    const ids = cirodown_extra_returns.ids;
    const create_ids = []
    for (const id in ids) {
      const ast = ids[id];
      create_ids.push({
        idid: id,
        path: ast.source_location.path,
        ast_json: JSON.stringify(ast),
        macro_name: ast.macro_name,
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
            // TODO happens on CirodownExample, likely also include,
            // need to fix and remove this if.
            from_id !== undefined
          ) {
            const ref_props = from_ids[from_id];
            const defined_ats = ref_props.defined_at
            for (const defined_at of defined_ats) {
              refs.push({
                from_id,
                defined_at,
                to_id_index: ref_props.child_index,
                to_id,
                type: sequelize.models.Ref.Types[type]
              })
            }
          }
        }
      }
    }

    return Promise.all([
      sequelize.models.Id.bulkCreate(create_ids, {
        transaction,
      }),
      sequelize.models.Ref.bulkCreate(refs, { transaction }),
    ])
  }
}

class SqliteFileProvider extends cirodown.FileProvider {
  constructor(sequelize, id_provider) {
    super();
    this.sequelize = sequelize;
    this.id_provider = id_provider
    this.get_path_entry_cache = {}
  }

  async get_path_entry_fetch(path, context) {
    const rows = await this.sequelize.models.File.findAll({
      where: { path },
      // We need to fetch these for toplevel scope removal.
      include: this.sequelize.models.Id,
    })
    for (const row of rows) {
      this.get_path_entry_cache[row.path] = row
      if (
        // Happens on some unminimized condition when converting
        // cirosantilli.github.io @ 04f0f5bc03b9071f82b706b3481c09d616d44d7b + 1
        // twice with cirodown -S ., no patience to minimize and test now.
        row.Id !== null &&
        // We have to do this if here because otherwise it would overwrite the reconciled header
        // we have stiched into the tree with Include.
        !this.id_provider.id_cache[row.Id.idid]
      ) {
        this.id_provider.add_row_to_id_cache(row.Id, context)
      }
    }
  }

  get_path_entry(path) {
    return this.get_path_entry_cache[path]
  }
}

async function create_sequelize(db_options, Sequelize) {
  const db_path = db_options.storage
  const default_options = {
    dialect: 'sqlite',
    define: { timestamps: false },
  }
  const new_db_options = Object.assign({}, default_options, db_options)
  const sequelize = new Sequelize(new_db_options)
  models.addModels(sequelize)
  if (db_path === cirodown.SQLITE_MAGIC_MEMORY_NAME && db_path || !fs.existsSync(db_path)) {
    await sequelize.sync()
  }
  return sequelize
}

async function update_database_after_convert({
  extra_returns,
  id_provider,
  sequelize,
  path,
  render,
  transaction,
}) {
  const context = extra_returns.context;
  cirodown.perf_print(context, 'convert_path_pre_sqlite_transaction')
  let toplevel_id;
  if (context.toplevel_ast !== undefined) {
    toplevel_id = context.toplevel_ast.id;
  }

  const file_bulk_create_opts = {}
  let file_bulk_create_last_parse
  if (extra_returns.errors.length > 0) {
    file_bulk_create_last_parse = null
    file_bulk_create_last_render = null
    file_bulk_create_opts.ignoreDuplicates = true
  } else {
    file_bulk_create_opts.updateOnDuplicate = ['last_parse']
    file_bulk_create_last_parse = Date.now()
    if (render) {
      file_bulk_create_opts.updateOnDuplicate.push('last_render')
      file_bulk_create_last_render = file_bulk_create_last_parse
    } else {
      file_bulk_create_last_render = null
    }
  }

  // This was the 80% bottleneck at Cirodown f8fc9eacfa794b95c1d9982a04b62603e6d0bb83
  // before being converted to a single transaction!
  // Likely would not have been a bottleneck if we new more about databases/had more patience
  // and instead of doing INSERT one by one we would do a single insert with a bunch of data.
  // The move to Sequelize made that easier with bulkCreate. But keeping the transaction just in case
  await sequelize.transaction({ transaction }, async (transaction) => {
    file_bulk_create_opts.transaction = transaction
    await Promise.all([
      id_provider.update(
        extra_returns,
        sequelize,
        transaction,
      ),
      sequelize.models.File.bulkCreate(
        [
          {
            path,
            toplevel_id,
            last_parse: file_bulk_create_last_parse,
            last_render: file_bulk_create_last_render,
          },
        ],
        file_bulk_create_opts,
      )
    ])
  });
  cirodown.perf_print(context, 'convert_path_post_sqlite_transaction')
}

function read_include({exists, read, path_sep, ext}) {
  function join(...parts) {
    return parts.join(path_sep)
  }
  if (ext === undefined) {
    ext = cirodown.CIRODOWN_EXT
  }
  return async (id, input_dir) => {
    let found = undefined;
    let test
    let basename = id + ext;
    if (basename[0] === path_sep) {
      test = id.substr(1)
      if (await exists(test)) {
        found = test;
      }
    } else {
      const input_dir_with_sep = input_dir + path_sep
      for (let i = input_dir_with_sep.length - 1; i > 0; i--) {
        if (input_dir_with_sep[i] === path_sep) {
          test = input_dir_with_sep.slice(0, i + 1) + basename
          if (await exists(test)) {
            found = test;
            break
          }
        }
      }
      if (found === undefined && await exists(basename)) {
        found = basename;
      }
    }
    if (found === undefined) {
      test = join(id, cirodown.INDEX_BASENAME_NOEXT + ext);
      if (input_dir !=='') {
        test = join(input_dir, test)
      }
      if (await exists(test)) {
        found = test;
      }
      if (found === undefined) {
        const id_parse = path.parse(id);
        if (id_parse.name === cirodown.INDEX_BASENAME_NOEXT) {
          for (let index_basename_noext of cirodown.INDEX_FILE_BASENAMES_NOEXT) {
            test = join(id_parse.dir, index_basename_noext + ext);
            if (await exists(test)) {
              found = test;
              break;
            }
          }
        }
      }
    }
    if (found !== undefined) {
      return [found, await read(found)];
    }
    return undefined;
  }
}

// https://stackoverflow.com/questions/9355403/deleting-duplicates-on-sorted-array/61974900#61974900
function remove_duplicates_sorted_array(arr) {
  return arr.filter((e, i, a) => e !== a[i - 1]);
}

module.exports = {
  SqliteFileProvider,
  SqliteIdProvider,
  create_sequelize,
  db_options,
  read_include,
  remove_duplicates_sorted_array,
  update_database_after_convert,
}
