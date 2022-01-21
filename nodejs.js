// Contains exports that should only be visible from Node.js but not browser.

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

class ZeroFileProvider extends cirodown.FileProvider {
  get(path) { return {toplevel_scope_cut_length: 0}; }
}
exports.ZeroFileProvider = ZeroFileProvider;

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

  async get_noscope_entries(ids, ignore_paths_set) {
    const cached_asts = []
    const non_cached_ids = []
    for (const id of ids) {
      let cached = false
      if (id in this.id_cache) {
        const ast = this.id_cache[id]
        if (
          ignore_paths_set === undefined ||
          !ignore_paths_set.has(ast.input_path)
        ) {
          cached_asts.push(ast)
          cached = true
        }
      }
      if (!cached) {
        non_cached_ids.push(id)
      }
    }
    const where = {
      idid: non_cached_ids,
    }
    if (ignore_paths_set !== undefined) {
      const ignore_paths = Array.from(ignore_paths_set).filter(x => x !== undefined)
      where.path = { [Op.not]: ignore_paths }
    }
    const non_cached_asts = []
    if (non_cached_ids.length) {
      const rows = await this.sequelize.models.Id.findAll({ where })
      for (const row of rows) {
        const ast = cirodown.AstNode.fromJSON(row.ast_json)
        ast.input_path = row.path
        ast.id = row.idid
        non_cached_asts.push(ast)
        this.id_cache[ast.id] = ast
      }
    }
    return cached_asts.concat(non_cached_asts)
  }

  async get_refs_to_warm_cache(ids, types) {
    //let searched_key, other_key;
    //if (reversed) {
    //  searched_key = 'from_id'
    //  other_key = 'to_id'
    //} else {
    //  searched_key = 'to_id'
    //  other_key = 'from_id'
    //}
    const op_or_list = []
    for (const search_key in types) {
      op_or_list.push(
        [search_key]: ids,
        type: types.map(type => this.sequelize.models.Ref.Types[type]),
      )
    }
    const where = { [Op.or]: op_or_list }
    const rows = await this.sequelize.models.Ref.findAll({ where })
    const search_key_type_sets = {}
    for (const search_key of types) {
      search_key_type_sets[search_key] = new Set(types[search_key])
    }
    for (const row of rows) {
      for (const searched_key in search_key_type_sets) {
        if ()

        let searched_key_dict = this.ref_cache[searched_key][row[searched_key]]
        if (searched_key_dict === undefined) {
          searched_key_dict = {}
          this.ref_cache[searched_key][row[searched_key]] = searched_key_dict
        }
        let searched_key_dict_type = searched_key_dict[row.type]
        if (searched_key_dict_type === undefined) {
          searched_key_dict_type = []
          searched_key_dict[row.type] = searched_key_dict_type
        }
        searched_key_dict_type.push(row)
      }
    }
  }

  get_refs_to(type, to_id, reversed=false) {
    let searched_key, other_key;
    if (reversed) {
      searched_key = 'from_id'
      other_key = 'to_id'
    } else {
      searched_key = 'to_id'
      other_key = 'from_id'
    }
    // We don't even query the DB here to ensure that the warm is getting everything,
    // as part of our effort to centralize all querries at a single poin.
    const ref_cache_to_id = this.ref_cache[searched_key][to_id]
    if (ref_cache_to_id === undefined) {
      return []
    }
    const ret = ref_cache_to_id[this.sequelize.models.Ref.Types[type]]
    if (ret === undefined) {
      return []
    }
    return ret
  }

  // Update the databases based on the output of the Cirodown conversion.
  async update(cirodown_extra_returns, sequelize, transaction) {
    const context = cirodown_extra_returns.context
    // Remove all IDs from the converted files to ensure that removed IDs won't be
    // left over hanging in the database.
    await this.clear(Array.from(context.include_path_set), transaction);

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
            const defined_ats = from_ids[from_id];
            for (const defined_at of defined_ats) {
              refs.push({
                from_id,
                defined_at,
                to_id,
                type: sequelize.models.Ref.Types[type]
              })
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
}
exports.SqliteIdProvider = SqliteIdProvider;

async function create_sequelize(db_options) {
  const default_options = {
    dialect: 'sqlite',
    define: { timestamps: false },
  }
  const new_db_options = Object.assign({}, default_options, db_options)
  const sequelize = new Sequelize(new_db_options)
  models.addModels(sequelize)
  await sequelize.sync()
  return sequelize
}
exports.create_sequelize = create_sequelize;
