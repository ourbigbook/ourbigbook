// Match only the first namespace, so filenames such as _raw inside a file are
// preserved. Recognize both spellings to make repeated runs harmless.
function rewritePath(value, down) {
  return value.replace(/(^|\/)(?:_(file|raw|dir|obb)|-\/(file|raw|dir|obb))(?=\/|$)/,
    (_, prefix, oldName, newName) => prefix + (down ? '_' : '-/') + (oldName || newName))
}

function rewriteUrl(value, down) {
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) {
    let url
    try { url = new URL(value, 'https://ourbigbook.com') } catch { return value }
    if (!['ourbigbook.com', 'localhost', '127.0.0.1'].includes(url.hostname) && !url.hostname.endsWith('.ourbigbook.com')) return value
  }
  // Query parameters are user data, not namespace identifiers.
  const [beforeHash, ...hash] = value.split('#')
  const [pathname, ...query] = beforeHash.split('?')
  return rewritePath(pathname, down) + (query.length ? '?' + query.join('?') : '') +
    (hash.length ? '#' + hash.join('#') : '')
}

function rewriteAst(value, down) {
  const idKeys = new Set(['id', 'idid', 'toplevel_id', 'scope', 'subdir', 'synonym', 'path', 'header_parent_ids'])
  function visit(node, key) {
    if (typeof node === 'string') return idKeys.has(key) ? rewritePath(node, down) : node
    if (Array.isArray(node)) return node.map(child => visit(child, key))
    if (node && typeof node === 'object') {
      for (const name of Object.keys(node)) node[name] = visit(node[name], name)
    }
    return node
  }
  return JSON.stringify(visit(JSON.parse(value)))
}

// Integer primary keys and foreign keys stay intact, as do upload storage paths,
// file bytes, source text, rendered HTML, timestamps, likes, discussions and user
// counters. Regenerate HTML separately with the article/issue/comment rerender tools.
const tables = {
  File: { path: rewritePath, toplevel_id: rewritePath },
  Id: { idid: rewritePath, toplevel_id: rewritePath, ast_json: rewriteAst },
  Ref: { from_id: rewritePath, to_id: rewritePath },
  Article: { slug: rewritePath, topicId: rewritePath },
  Topic: { topicId: rewritePath },
  User: { image: rewriteUrl },
}

async function migrate(queryInterface, down=false) {
  const sequelize = queryInterface.sequelize
  await sequelize.transaction(async transaction => {
    for (const [table, transforms] of Object.entries(tables)) {
      const columns = Object.keys(transforms)
      const patterns = ['file', 'raw', 'dir', 'obb'].map(name => `%${down ? '-/' : '_'}${name}%`)
      const where = columns.flatMap(column => patterns.map(pattern => `"${column}" LIKE ${sequelize.escape(pattern)}`)).join(' OR ')
      let lastId = 0
      while (true) {
        const [rows] = await sequelize.query(
          `SELECT "id", ${columns.map(column => `"${column}"`).join(', ')} FROM "${table}" WHERE "id" > :lastId AND (${where}) ORDER BY "id" LIMIT 500`,
          { replacements: { lastId }, transaction },
        )
        if (!rows.length) break
        for (const row of rows) {
          const update = {}
          for (const [column, transform] of Object.entries(transforms)) {
            if (row[column] === null) continue
            const value = transform(row[column], down)
            if (value !== row[column]) update[column] = value
          }
          if (Object.keys(update).length) await queryInterface.bulkUpdate(table, update, { id: row.id }, { transaction })
        }
        lastId = rows[rows.length - 1].id
      }
    }
    // Article topicId triggers run while the old/new topic names are being
    // exchanged. Reconcile the affected caches after both tables are renamed.
    const topicWhere = ['file', 'raw', 'dir', 'obb'].map(name =>
      `"Topic"."topicId" LIKE ${sequelize.escape(`%${down ? '_' : '-/'}${name}%`)}`
    ).join(' OR ')
    await sequelize.query(`UPDATE "Topic" SET "articleCount" = (
      SELECT COUNT(*) FROM "Article" WHERE "Article"."topicId" = "Topic"."topicId" AND "Article"."list" = ${sequelize.escape(true)}
    ) WHERE ${topicWhere}`, { transaction })
  })
}

module.exports = {
  up: queryInterface => migrate(queryInterface),
  down: queryInterface => migrate(queryInterface, true),
}
