const mime = require('mime')
const Sequelize = require('sequelize')
const { imageDimensions } = require('ourbigbook/nodejs')

const { DataTypes } = Sequelize

const { URL_SEP } = require('ourbigbook')
const { hashToHex } = require('ourbigbook/web_api')
const { sequelizeWhereStartsWith } = require('ourbigbook/models')
const { sequelizeCreateTrigger } = require('ourbigbook/nodejs_webpack_safe')

const { defaultProfileImage, uploadPathComponent } = require('../front/config')

// https://stackoverflow.com/a/77861877/895245
function isValidUtf8(bytes) {
  try {
    (new TextDecoder('utf8', { fatal: true })).decode(bytes)
  } catch {
    return false
  }
  return true
}

module.exports = (sequelize) => {
  const Upload = sequelize.define(
    'Upload',
    {
      path: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: {
          msg: 'path is taken.'
        },
      },
      bytes: {
        type: DataTypes.BLOB,
        allowNull: false,
      },
      contentType: {
        type: DataTypes.STRING(256),
        allowNull: false,
      },
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      // Natural image dimensions, populated when image bytes are uploaded.
      // These remain NULL for non-images or formats whose dimensions cannot be
      // read safely from the bytes.
      width: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      height: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      hash: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      list: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      indexes: [
        { fields: ['contentType', 'path'] },
        { fields: ['createdAt'] },
        { fields: ['hash'] },
        { fields: ['size'] },
        { fields: ['updatedAt'] },
        { fields: ['parentId', 'path'] },
        ...['createdAt', 'updatedAt', 'size', 'path'].map(column => ({ fields: ['list', column] })),
      ]
    }
  )

  Upload.upsertSideEffects = async function(obj, opts={}) {
    const { transaction } = opts
    const { UploadDirectory } = sequelize.models
    if (obj.bytes !== undefined) {
      obj = { ...obj, ...(obj.contentType?.startsWith('image/')
        ? await imageDimensions(obj.bytes) : { width: null, height: null }) }
    }
    return sequelize.transaction({ transaction }, async (transaction) => {
      // Replacing bytes must not silently relist a file.
      if (obj.list === undefined) {
        const existing = await Upload.findOne({ where: { path: obj.path }, attributes: ['list'], transaction })
        obj = { ...obj, list: existing ? existing.list : true }
      }
      const pathSplit = obj.path.split(URL_SEP)
      const newDirPaths = []
      for (let i = 0; i < pathSplit.length; i++) {
        newDirPaths.push(pathSplit.slice(0, i).join(URL_SEP))
      }

      // Create upload and directories.
      const createPromises = []
      for (const newPath of newDirPaths) {
        createPromises.push(UploadDirectory.upsert({ path: newPath }, { transaction }))
      }
      createPromises.push(Upload.upsert(obj, { transaction }))
      await Promise.all(createPromises)

      // Get created objects as upsert does not set ID.
      const newObjsPromise = []
      for (const newPath of newDirPaths) {
        newObjsPromise.push(UploadDirectory.findOne({ where: { path: newPath }, transaction }))
      }
      newObjsPromise.push(Upload.findOne({ where: { path: obj.path }, transaction }))
      const newObjs = await Promise.all(newObjsPromise)
      const upload = newObjs[newObjs.length - 1]

      // Set parents.
      const parentPromises = []
      for (let i = 1; i < newObjs.length - 1; i++) {
        parentPromises.push(UploadDirectory.update(
          { parentId: newObjs[i - 1].id },
          {
            where: { id: newObjs[i].id },
            transaction,
          },
        ))
      }

      parentPromises.push(Upload.update(
          { parentId: newObjs[newObjs.length - 2].id },
          {
            where: { id: upload.id },
            transaction,
          },
      ))
      await Promise.all(parentPromises)
      return upload
    })
  }

  Upload.prototype.destroySideEffects = async function(opts) {
    const { transaction } = opts
    const { UploadDirectory } = sequelize.models
    return sequelize.transaction({ transaction }, async (transaction) => {
      const pathSplit = this.path.split(URL_SEP)
      const directoriesPromise = []
      for (let i = 0; i < pathSplit.length; i++) {
        directoriesPromise.push(
          UploadDirectory.findOne({
            where: {
              path: pathSplit.slice(0, i).join(URL_SEP)
            },
            include: [
              {
                model: Upload,
                as: 'childFiles',
                attributes: ['id'],
                required: false,
              },
              {
                model: UploadDirectory,
                as: 'childDirectories',
                attributes: ['id'],
                required: false,
              },
            ],
            transaction,
          })
        )
      }
      const directories = await Promise.all(directoriesPromise)
      const deleteDirectoryIds = []
      for (let i = directories.length - 1; i >= 0; i-- ) {
        const d = directories[i]
        if (d.childFiles.length + d.childDirectories.length === 1) {
          deleteDirectoryIds.push(d.id)
        } else {
          break
        }
      }
      return (await Promise.all([
        this.destroy({ transaction }),
        UploadDirectory.destroy({
          transaction,
          where: { id: deleteDirectoryIds },
        })
      ]))[0]
    })
  }

  /** 1, 'path/to/myfile.txt' => 'uploads/1/path/to/myfile.txt' */
  Upload.uidAndPathToUploadPath = function (uid, path) {
    return `${uploadPathComponent}${URL_SEP}${uid}${path ? URL_SEP : ''}${path}`
  }

  Upload.getCreateObj = function ({ bytes, path }) {
    let contentType
    const mimeType = mime.getType(path)
    if (mimeType) {
      contentType = mimeType
    } else {
      if (isValidUtf8(bytes)) {
        contentType = 'text/plain; charset=utf-8'
      } else {
        contentType = 'application/octet-stream'
      }
    }
    return {
      path: path,
      bytes,
      contentType,
      hash: hashToHex(bytes),
      size: bytes.length,
    }
  }


  Upload.pathToActualPath = async function(path, User, Upload, opts={})  {
    const { transaction } = opts
    const pathSplit = path.split(URL_SEP)
    const authorUsername = pathSplit[0]
    const pathNoUsername = pathSplit.slice(1).join(URL_SEP)
    const author = await User.findOne({ where: { username: authorUsername }, transaction })
    let actualPath
    if (author) {
      actualPath = Upload.uidAndPathToUploadPath(author.id, pathNoUsername)
    }
    return {
      author,
      // Cannot be derived from author when author ID does not exist.
      authorUsername,
      path: actualPath,
    }
  }

  Upload.fileIndexWhere = (authorId) => ({
    path: sequelizeWhereStartsWith(sequelize,
      authorId === undefined ? uploadPathComponent + URL_SEP : Upload.uidAndPathToUploadPath(authorId, '') + URL_SEP,
      '"Upload"."path"'),
  })

  Upload.getFileIndex = async function({ authorId, list, limit=20, offset=0, order='createdAt', orderAscDesc }={}) {
    if (!['createdAt', 'updatedAt', 'size', 'path'].includes(order)) throw new Error('Invalid file order')
    if (orderAscDesc === undefined) orderAscDesc = order === 'path' ? 'ASC' : 'DESC'
    const attributes = ['id', 'path', 'size', 'contentType', 'createdAt', 'updatedAt', 'list']
    const where = { ...Upload.fileIndexWhere(authorId), ...(list === undefined ? {} : { list }) }
    let count, rows
    if (order === 'path' && authorId === undefined) {
      if (!/^(ASC|DESC)( NULLS (FIRST|LAST))?$/i.test(orderAscDesc)) throw new Error('Invalid file order direction')
      // Join by primary key instead of scanning User for a matching path
      // prefix once per upload. Keep the prefix check to preserve the fallback
      // for orphaned/malformed paths (including noncanonical numeric IDs).
      const postgres = sequelize.getDialect() === 'postgres'
      const suffix = `substr("Upload"."path", ${uploadPathComponent.length + 2})`
      const ownerText = postgres ? `split_part("Upload"."path", '/', 2)`
        : `substr(${suffix}, 1, instr(${suffix}, '/') - 1)`
      // User.id is INTEGER. Bound the cast to prevent malformed paths from
      // throwing or overflowing BIGINT; SQLite's integer cast never throws.
      const ownerId = postgres
        ? `CASE WHEN ${ownerText} ~ '^-?[0-9]{1,10}$' THEN CAST(${ownerText} AS BIGINT) END`
        : `CAST(${ownerText} AS INTEGER)`
      let page
      ;[count, page] = await Promise.all([
        Upload.count({ where }),
        sequelize.query(`SELECT "Upload"."id"
FROM "Upload"
LEFT JOIN "User" ON "User"."id" = ${ownerId} AND ${fileOwnerWhere('"Upload"."path"')}
WHERE "Upload"."path" LIKE :prefix${list === undefined ? '' : ' AND "Upload"."list" = :list'}
ORDER BY COALESCE("User"."username" || substr("Upload"."path", length('${uploadPathComponent}/' || "User"."id") + 1), "Upload"."path") ${orderAscDesc}, "Upload"."id" DESC
LIMIT :limit OFFSET :offset`, {
          replacements: { prefix: `${uploadPathComponent}/%`, list, limit, offset },
          type: Sequelize.QueryTypes.SELECT,
        }),
      ])
      // Fetch metadata only for the selected page, never file bytes or hashes.
      const selected = page.length ? await Upload.findAll({
        attributes, where: { id: page.map(row => row.id) },
      }) : []
      const byId = new Map(selected.map(row => [row.id, row]))
      rows = page.map(row => byId.get(row.id)).filter(Boolean)
    } else {
      ;({ count, rows } = await Upload.findAndCountAll({
        attributes, where, limit, offset,
        order: [[order, orderAscDesc], ['id', 'DESC']],
      }))
    }
    const users = await sequelize.models.User.findAll({
      attributes: ['id', 'username', 'displayName', 'image', 'score'],
      // Malformed/orphaned upload paths must not overflow User's INTEGER ID.
      where: { id: rows.map(row => row.path.split(URL_SEP)[1]).filter(id => /^\d+$/.test(id) && Number(id) <= 2147483647) },
    })
    const authors = new Map(users.map(user => [String(user.id), {
      username: user.username,
      displayName: user.displayName,
      effectiveImage: user.image || defaultProfileImage,
      score: user.score,
    }]))
    return {
      count,
      files: rows.map(row => {
        const [, uid, ...parts] = row.path.split(URL_SEP)
        const author = authors.get(uid) || null
        const username = author?.username
        const encodedPath = parts.map(encodeURIComponent).join(URL_SEP)
        return {
          author,
          list: row.list,
          path: username ? `${username}/${parts.join(URL_SEP)}` : row.path,
          url: username ? `/${username}/-/file/${encodedPath}` : null,
          previewUrl: username && row.contentType.startsWith('image/') ? `/${username}/-/raw/${encodedPath}` : null,
          contentType: row.contentType,
          size: row.size,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      }),
    }
  }

  Upload.prototype.toJson = function(loggedInUser) {
    return {
      list: this.list,
      createdAt: this.createdAt.toISOString(),
      contentType: this.contentType,
      hash: this.hash,
      path: this.path,
      size: this.size,
      updatedAt: this.updatedAt.toISOString(),
    }
  }

  Upload.prototype.toEntryJson = function() {
    return {
      list: this.list,
      path: this.path,
    }
  }

  Upload.getDirectory = async function({ authorId, path='', list }) {
    const { UploadDirectory } = sequelize.models
    return UploadDirectory.findOne({
      where: { path: Upload.uidAndPathToUploadPath(authorId, path) },
      include: [
        {
          model: UploadDirectory, as: 'childDirectories', attributes: ['path'], required: false,
          // Hide branches containing only unlisted files in the default tree.
          ...(list === undefined ? {} : { where: sequelize.literal(`EXISTS (
            SELECT 1 FROM "Upload" AS "visibleUpload"
            WHERE substr("visibleUpload"."path", 1, length("childDirectories"."path") + 1) = "childDirectories"."path" || '/'
              AND "visibleUpload"."list" = ${sequelize.escape(list)}
          )`) }),
        },
        { model: Upload, as: 'childFiles', attributes: ['path', 'list'], required: false,
          ...(list === undefined ? {} : { where: { list } }) },
      ],
    })
  }

  return Upload
}

// Upload ownership is encoded in the path. Include the trailing separator so
// user 1 does not also own user 10's files, and exclude the profile namespace.
function fileOwnerWhere(path) {
  const prefix = `'${uploadPathComponent}/' || "User"."id" || '/'`
  return `substr(${path}, 1, length(${prefix})) = ${prefix}`
}
module.exports.fileOwnerWhere = fileOwnerWhere

module.exports.createFileCountTriggers = async function(sequelize, transaction, listedOnly=true) {
  const update = (row, delta) =>
    `UPDATE "User" SET "fileCount" = "fileCount" ${delta} 1 WHERE ${fileOwnerWhere(`${row}."path"`)}${listedOnly ? ` AND ${row}."list" = ${sequelize.escape(true)}` : ''}`
  for (const operation of ['insert', 'delete', 'update']) {
    const statements = []
    if (operation !== 'insert') statements.push(update('OLD', '-'))
    if (operation !== 'delete') statements.push(update('NEW', '+'))
    if (sequelize.options.dialect === 'sqlite') {
      await sequelize.query(`DROP TRIGGER IF EXISTS "Upload_${operation}_user_file_count"`, { transaction })
    }
    await sequelizeCreateTrigger(sequelize, { tableName: 'Upload' }, operation, statements.join(';\n'), {
      nameExtra: 'user_file_count',
      transaction,
      when: operation === 'update' ? 'OLD."path" <> NEW."path"' + (listedOnly ? ' OR OLD."list" <> NEW."list"' : '') : undefined,
    })
  }
}

module.exports.createFileSizeTriggers = async function(sequelize, transaction, listedOnly=true) {
  const update = (row, delta) =>
    `UPDATE "User" SET "fileSize" = "fileSize" ${delta} ${row}."size" WHERE ${fileOwnerWhere(`${row}."path"`)}${listedOnly ? ` AND ${row}."list" = ${sequelize.escape(true)}` : ''}`
  for (const operation of ['insert', 'delete', 'update']) {
    const statements = []
    if (operation !== 'insert') statements.push(update('OLD', '-'))
    if (operation !== 'delete') statements.push(update('NEW', '+'))
    if (sequelize.options.dialect === 'sqlite') {
      await sequelize.query(`DROP TRIGGER IF EXISTS "Upload_${operation}_user_file_size"`, { transaction })
    }
    await sequelizeCreateTrigger(sequelize, { tableName: 'Upload' }, operation, statements.join(';\n'), {
      nameExtra: 'user_file_size',
      transaction,
      when: operation === 'update' ? 'OLD."path" <> NEW."path" OR OLD."size" <> NEW."size"' + (listedOnly ? ' OR OLD."list" <> NEW."list"' : '') : undefined,
    })
  }
}
