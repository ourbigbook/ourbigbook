const mime = require('mime')
const Sequelize = require('sequelize')

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
      hash: {
        type: DataTypes.STRING(512),
        allowNull: false,
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
      ]
    }
  )

  Upload.upsertSideEffects = async function(obj, opts={}) {
    const { transaction } = opts
    const { UploadDirectory } = sequelize.models
    return sequelize.transaction({ transaction }, async (transaction) => {
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

  Upload.getFileIndex = async function({ authorId, limit=20, offset=0, order='createdAt', orderAscDesc }={}) {
    if (!['createdAt', 'updatedAt', 'size', 'path'].includes(order)) throw new Error('Invalid file order')
    if (orderAscDesc === undefined) orderAscDesc = order === 'path' ? 'ASC' : 'DESC'
    // Global paths start with the public username, not the numeric ID stored
    // in Upload.path. Sort in SQL before pagination, using the displayed path.
    const orderColumn = order === 'path' && authorId === undefined ? sequelize.literal(`COALESCE((
      SELECT "User"."username" || substr("Upload"."path", length('${uploadPathComponent}/' || "User"."id") + 1)
      FROM "User" WHERE ${fileOwnerWhere('"Upload"."path"')}
    ), "Upload"."path")`) : order
    const { count, rows } = await Upload.findAndCountAll({
      attributes: ['id', 'path', 'size', 'contentType', 'createdAt', 'updatedAt'],
      where: Upload.fileIndexWhere(authorId),
      limit,
      offset,
      order: [[orderColumn, orderAscDesc], ['id', 'DESC']],
    })
    const users = await sequelize.models.User.findAll({
      attributes: ['id', 'username', 'displayName', 'image', 'score'],
      where: { id: rows.map(row => row.path.split(URL_SEP)[1]).filter(id => /^\d+$/.test(id)) },
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
          path: username ? `${username}/${parts.join(URL_SEP)}` : row.path,
          url: username ? `/${username}/_file/${encodedPath}` : null,
          previewUrl: username && row.contentType.startsWith('image/') ? `/${username}/_raw/${encodedPath}` : null,
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
      path: this.path,
    }
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

module.exports.createFileCountTriggers = async function(sequelize, transaction) {
  const update = (row, delta) =>
    `UPDATE "User" SET "fileCount" = "fileCount" ${delta} 1 WHERE ${fileOwnerWhere(`${row}."path"`)}`
  for (const operation of ['insert', 'delete', 'update']) {
    const statements = []
    if (operation !== 'insert') statements.push(update('OLD', '-'))
    if (operation !== 'delete') statements.push(update('NEW', '+'))
    await sequelizeCreateTrigger(sequelize, { tableName: 'Upload' }, operation, statements.join(';\n'), {
      nameExtra: 'user_file_count',
      transaction,
      when: operation === 'update' ? 'OLD."path" <> NEW."path"' : undefined,
    })
  }
}

module.exports.createFileSizeTriggers = async function(sequelize, transaction) {
  const update = (row, delta) =>
    `UPDATE "User" SET "fileSize" = "fileSize" ${delta} ${row}."size" WHERE ${fileOwnerWhere(`${row}."path"`)}`
  for (const operation of ['insert', 'delete', 'update']) {
    const statements = []
    if (operation !== 'insert') statements.push(update('OLD', '-'))
    if (operation !== 'delete') statements.push(update('NEW', '+'))
    await sequelizeCreateTrigger(sequelize, { tableName: 'Upload' }, operation, statements.join(';\n'), {
      nameExtra: 'user_file_size',
      transaction,
      when: operation === 'update' ? 'OLD."path" <> NEW."path" OR OLD."size" <> NEW."size"' : undefined,
    })
  }
}
