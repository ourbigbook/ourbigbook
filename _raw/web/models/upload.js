const mime = require('mime')
const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

const { URL_SEP } = require('ourbigbook')
const { hashToHex } = require('ourbigbook/web_api')

const { uploadPathComponent } = require('../front/config')

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
      return await Promise.all([
        this.destroy({ transaction }),
        UploadDirectory.destroy({ where: { id: deleteDirectoryIds }})
      ])[0]
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
