// Recursive alternatives for the environment-gated article-page benchmark.
// Keep ordering independent of the derived nested-set columns, including
// across separately fetched ToC branches. Sibling positions are nonnegative
// INTEGERs; padding to ten digits gives the same order in JS and both DBs.
const ourbigbook = require('ourbigbook')
const hex = (sequelize, value) => sequelize.getDialect() === 'postgres'
  ? `encode(convert_to(${value}, 'UTF8'), 'hex')` : `hex(${value})`
const position = (sequelize, value) => sequelize.getDialect() === 'postgres'
  ? `lpad(CAST(${value} AS TEXT), 10, '0')` : `printf('%010d', ${value})`
const orderSql = sequelize => '"tree"."treeOrder"' + (sequelize.getDialect() === 'postgres' ? ' COLLATE "C"' : '')

function replacements(sequelize, article, recursive) {
  const username = article.slug.split('/')[0]
  return {
    rootId: `@${article.slug}`, authorRoot: `@${username}`, authorPrefix: `@${username}/`,
    parentType: sequelize.models.Ref.Types[ourbigbook.REFS_TABLE_PARENT],
    rootDepth: recursive?.depth, rootOrder: recursive?.treeOrder,
  }
}

async function getPosition(sequelize, article, { logging=false }={}) {
  const rows = await sequelize.query(`WITH RECURSIVE parents (id, depth, "treeOrder", visited) AS (
    SELECT CAST(:rootId AS TEXT), 0, CAST('' AS TEXT), '/' || ${hex(sequelize, ':rootId')} || '/'
    UNION ALL
    SELECT r.from_id, p.depth + 1,
      '/' || ${position(sequelize, 'r.to_id_index')} || p."treeOrder",
      p.visited || ${hex(sequelize, 'r.from_id')} || '/'
    FROM "Ref" r JOIN parents p ON r.to_id = p.id
    WHERE r.type = :parentType AND r.to_id_index IS NOT NULL
      AND (r.from_id = :authorRoot OR substr(r.from_id, 1, length(:authorPrefix)) = :authorPrefix)
      AND p.visited NOT LIKE '%/' || ${hex(sequelize, 'r.from_id')} || '/%'
  ) SELECT depth, "treeOrder" FROM parents ORDER BY depth DESC LIMIT 1`, {
    replacements: replacements(sequelize, article), type: sequelize.QueryTypes.SELECT, logging,
  })
  return rows[0]
}

function descendantsCte(sequelize, directChildren=false) {
  return `WITH RECURSIVE tree (id, depth, "treeOrder", visited) AS (
    SELECT CAST(:rootId AS TEXT), :rootDepth, CAST(:rootOrder AS TEXT), '/' || ${hex(sequelize, ':rootId')} || '/'
    UNION ALL
    SELECT r.to_id, t.depth + 1,
      t."treeOrder" || '/' || ${position(sequelize, 'r.to_id_index')},
      t.visited || ${hex(sequelize, 'r.to_id')} || '/'
    FROM "Ref" r JOIN tree t ON r.from_id = t.id
    WHERE r.type = :parentType AND r.to_id_index IS NOT NULL
      AND substr(r.to_id, 1, length(:authorPrefix)) = :authorPrefix
      AND t.visited NOT LIKE '%/' || ${hex(sequelize, 'r.to_id')} || '/%'
      ${directChildren ? 'AND t.id = :rootId' : ''}
  )\n`
}

function hasChildSql() {
  return `CASE WHEN EXISTS (
    SELECT 1 FROM "Ref" r
    JOIN "Article" child ON child.slug = substr(r.to_id, 2)
    WHERE r.from_id = '@' || "Article".slug AND r.type = :parentType
      AND r.to_id_index IS NOT NULL AND child."authorId" = "Article"."authorId" AND child.list
  ) THEN 1 ELSE 0 END`
}

module.exports = { descendantsCte, getPosition, hasChildSql, orderSql, replacements }
