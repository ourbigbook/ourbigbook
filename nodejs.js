// Contains exports that should only be visible from Node.js but not browser.

const fs = require('fs');
const path = require('path');

const { Op, Sequelize } = require('sequelize')

const cirodown = require('cirodown');
const models = require('cirodown/models')

const ENCODING = 'utf8';
exports.ENCODING = ENCODING;

const PACKAGE_NAME = 'cirodown';
exports.PACKAGE_NAME = PACKAGE_NAME;

// https://stackoverflow.com/questions/10111163/in-node-js-how-can-i-get-the-path-of-a-module-i-have-loaded-via-require-that-is
const PACKAGE_PATH = path.dirname(require.resolve(path.join(PACKAGE_NAME, 'package.json')));
exports.PACKAGE_PATH = PACKAGE_PATH;

const DIST_PATH = path.join(PACKAGE_PATH, 'dist');
exports.DIST_PATH = DIST_PATH;

const DIST_CSS_BASENAME = PACKAGE_NAME + '.css';
exports.DIST_CSS_BASENAME = DIST_CSS_BASENAME;

const DIST_CSS_PATH = path.join(DIST_PATH, DIST_CSS_BASENAME);
exports.DIST_CSS_PATH = DIST_CSS_PATH;

const DIST_JS_BASENAME = PACKAGE_NAME + '_runtime.js';
exports.DIST_JS_BASENAME = DIST_JS_BASENAME;

const DIST_JS_PATH = path.join(DIST_PATH, DIST_JS_BASENAME);
exports.DIST_JS_PATH = DIST_JS_PATH;

const PACKAGE_NODE_MODULES_PATH = path.join(PACKAGE_PATH, 'node_modules');
exports.PACKAGE_NODE_MODULES_PATH = PACKAGE_NODE_MODULES_PATH;

const PACKAGE_PACKAGE_JSON_PATH = path.join(PACKAGE_PATH, 'package.json');
exports.PACKAGE_PACKAGE_JSON_PATH = PACKAGE_PACKAGE_JSON_PATH;

const GITIGNORE_PATH = path.join(PACKAGE_PATH, 'gitignore');
exports.GITIGNORE_PATH = GITIGNORE_PATH;

const PACKAGE_SASS_BASENAME = PACKAGE_NAME + '.scss';
exports.PACKAGE_SASS_BASENAME = PACKAGE_SASS_BASENAME;

const TMP_DIRNAME = 'out';
exports.TMP_DIRNAME = TMP_DIRNAME;

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
      this.sequelize.models.Id.destroy({ where: { path: { [Op.like]: prefix_literal } } }),
      this.sequelize.models.Ref.destroy({ where: { defined_at: { [Op.like]: prefix_literal } } }),
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
        where.path = { [Op.not]: ignore_paths }
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
            where: { type: this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT] },
            required: false,
          }
        ],
      })
      for (const row of rows) {
        asts.push(this.add_row_to_id_cache(row, context))
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
        where.defined_at = { [Op.not]: ignore_paths }
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
  build_header_tree(starting_ids_to_asts, fetch_header_tree_ids_rows, { context }) {
    const asts = []
    for (const row of fetch_header_tree_ids_rows) {
      const ast = this.row_to_ast(row, context)
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
    }
  }

  async fetch_header_tree_ids(starting_ids_to_asts) {
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
    ;const [rows, meta] = await this.sequelize.query(`SELECT * FROM "Ids"
INNER JOIN (
WITH RECURSIVE
  tree_search (to_id, level, from_id, to_id_index) AS (
    SELECT
      to_id,
      0,
      from_id,
      to_id_index
    FROM "Refs"
    WHERE from_id IN (:starting_ids) AND type = :type

    UNION ALL

    SELECT
      t.to_id,
      ts.level + 1,
      ts.to_id,
      t.to_id_index
    FROM "Refs" t, tree_search ts
    WHERE t.from_id = ts.to_id AND type = :type
  )
  SELECT * FROM tree_search
  ORDER BY level, from_id, to_id_index
) AS "RecRefs"
ON "Ids".idid = "RecRefs"."to_id"
`,
      { replacements: {
        starting_ids: Object.keys(starting_ids_to_asts),
        type: this.sequelize.models.Ref.Types[cirodown.REFS_TABLE_PARENT],
      } }
    )
    return rows
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
        // We error check duplicate separately before, just ignore them here.
        ignoreDuplicates: true,
        transaction,
      }),
      sequelize.models.Ref.bulkCreate(refs, { transaction }),
    ])
  }
}
exports.SqliteIdProvider = SqliteIdProvider;

async function create_sequelize(db_options) {
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
exports.create_sequelize = create_sequelize;
