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

  add_row_to_id_cache(row) {
    if (row !== null) {
      const ast = cirodown.AstNode.fromJSON(row.ast_json)
      ast.input_path = row.path
      ast.id = row.idid
      if (
        // Possible on reference to ID that does not exist and some other
        // non error cases I didn't bother to investigate.
        row.to !== undefined
      ) {
        ast.header_parent_ids = row.to.map(to => to.from_id)
      }
      if (row.from !== undefined) {
        ast.header_child_ids = row.from.map(from => from.to_id)
      }
      this.id_cache[ast.id] = ast
      return ast
    }
  }

  async get_noscopes_base_fetch(ids, ignore_paths_set) {
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
        asts.push(this.add_row_to_id_cache(row))
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

  async get_refs_to_fetch(types, to_ids, { reversed, ignore_paths_set }) {
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
        this.add_row_to_id_cache(row[include_key])
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
    // as part of our effort to centralize all querries at a single poin.
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
      const id_idx = ast.get_header_parent_ids_and_idxs(context)[0]
      let parent_id, parent_idx
      if (id_idx !== undefined) {
        parent_id = id_idx.id
        parent_idx = id_idx.idx
      }
      create_ids.push({
        idid: id,
        parent_id,
        parent_idx,
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
