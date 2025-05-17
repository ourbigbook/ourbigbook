// This endpoint implements a simplistic in-DB filesystem that stores and retrieves blobs given an input path.
// These should likely be stored in a static file server, but lazy to set that up for now, so I'll
// just store everything in the DB to start with until I regret the choice one day and migrate.

const router = require('express').Router()

const { FILE_PREFIX, Macro, URL_SEP } = require('ourbigbook')
const { sequelizeWhereStartsWith } = require('ourbigbook/models')
const { ARTICLE_HASH_LIMIT_MAX } = require('ourbigbook/web_api')

const auth = require('../auth')
const lib = require('./lib')
const { ValidationError } = lib
const convert = require('../convert')
const { cant } = require('../front/cant')
const config = require('../front/config')

async function pathToActualPath(path, User, Upload, opts={}) {
  const ret = await Upload.pathToActualPath(path, User, Upload, opts)
  if (!ret.path) {
    throw new lib.ValidationError(`username does not exist: ${ret.authorUsername}`, 404)
  }
  return ret
}

async function get(req, res, next, path) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Upload, User } = sequelize.models
    if (!path) {
      throw new lib.ValidationError(`path must be given and cannot be empty`)
    }
    await sequelize.transaction(async (transaction) => {
      const { path: actualPath } = await pathToActualPath(path, User, Upload, { transaction })
      const upload = await Upload.findOne({ where: { path: actualPath }, transaction })
      if (!upload) {
        throw new lib.ValidationError(`path does not exist: ${path}`, 404)
      }
      res.set({
        'Content-Type': upload.contentType,
        'Last-Modified': upload.updatedAt.toUTCString(),
        'Content-Security-Policy': "default-src 'none'",
      })
      res.write(upload.bytes)
    })
    return res.end()
  } catch(error) {
    next(error);
  }
}

router.get('/', auth.optional, async function(req, res, next) {
  return get(req, res, next, req.query.path)
})

router.get('/profile-picture/:uid', auth.optional, async function(req, res, next) {
  try {
    const uid = req.params.uid
    const sequelize = req.app.get('sequelize')
    const { Upload } = sequelize.models
    await sequelize.transaction(async (transaction) => {
      const upload = await Upload.findOne({ where: { path: `${config.profilePicturePathComponent}/${uid}` }, transaction })
      if (!upload) {
        throw new lib.ValidationError(`path does not exist: ${path}`, 404)
      }
      res.set({
        'Content-Type': upload.contentType,
        'Last-Modified': upload.updatedAt.toUTCString(),
        'Content-Security-Policy': "default-src 'none'",
      })
      res.write(upload.bytes)
    })
    return res.end()
  } catch(error) {
    next(error);
  }
})

router.put('/', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { User, Upload } = sequelize.models
    await sequelize.transaction(async (transaction) => {
      const loggedInUser = await User.findByPk(req.payload.id, { transaction })
      let msg = cant.createArticle(loggedInUser)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
      const path = req.query.path
      if (!path) {
        throw new lib.ValidationError(`path must be given and cannot be empty`)
      }
      const { path: actualPath, author } = await pathToActualPath(path, User, Upload, { transaction })
      msg = cant.editArticle(loggedInUser, author.username)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
      const bytes = req.body
      const [existing, count] = await Promise.all([
        Upload.count({ where: { path: actualPath } }, { transaction }),
        Upload.count({
          where: {
            path: sequelizeWhereStartsWith(
              sequelize,
              Upload.uidAndPathToUploadPath(author.id, ''),
              '"Upload"."path"'
            ),
          },
          transaction,
        }),
      ])
      if (
        !loggedInUser.admin &&
        existing === 0 &&
        count >= author.maxUploads
      ) {
        throw new ValidationError(
          `You have reached your maximum number of uploads: ${loggedInUser.maxUploads}. ` +
          `Please ask an admin to raise it for you: ${config.contactUrl}`,
          403
        )
      }
      if (!loggedInUser.admin && bytes.length > loggedInUser.maxUploadSize) {
        throw new ValidationError(
          `The upload size (${bytes.length} bytes) was larger than your maximum ` +
          `upload size (${loggedInUser.maxUploadSize} bytes)`,
          403,
        )
      }
      await Upload.upsertSideEffects(Upload.getCreateObj({ bytes, path: actualPath }), { transaction })
    })
    return res.json({})
  } catch(error) {
    next(error);
  }
})

router.delete('/', auth.required, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Article, File, User, Upload } = sequelize.models
    await sequelize.transaction(async (transaction) => {
      const loggedInUser = await User.findByPk(req.payload.id, { transaction })
      let msg = cant.createArticle(loggedInUser)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
      const path = req.query.path
      if (!path) {
        throw new lib.ValidationError(`path must be given and cannot be empty`)
      }
      const { path: actualPath, author } = await pathToActualPath(path, User, Upload, { transaction })
      msg = cant.editArticle(loggedInUser, author.username)
      if (msg) {
        throw new lib.ValidationError([msg], 403)
      }
      const upload = await Upload.findOne({ where: { path: actualPath }, transaction})
      if (!upload) {
        throw new lib.ValidationError(`path does not exist: ${path}`, 404)
      }
      const article = await Article.findOne({
        where: {
          slug:
            `${author.username}${Macro.HEADER_SCOPE_SEPARATOR}${FILE_PREFIX}${Macro.HEADER_SCOPE_SEPARATOR}${path.split(URL_SEP).slice(1).join(URL_SEP)}`
        },
        include: [{
          model: File,
          as: 'file',
        }],
        transaction,
      })
      if (article) {
        const ret = await convert.convertArticle({
          author,
          bodySource: '{file}',
          list: false,
          sequelize,
          render: true,
          titleSource: article.file.titleSource,
          transaction,
          updateNestedSetIndex: false,
        })
      }
      await upload.destroySideEffects({ transaction })
    })
    return res.json({})
  } catch(error) {
    next(error);
  }
})

router.get('/hash', auth.optional, async function(req, res, next) {
  try {
    const sequelize = req.app.get('sequelize')
    const { Upload, User } = sequelize.models
    const [limit, offset] = lib.getLimitAndOffset(req, res, {
      limitMax: ARTICLE_HASH_LIMIT_MAX,
    })
    const authorUsername = req.query.author
    // Require it for now, I'm lazy to fetch authors to replace upload/uid with upload/username
    // Perhaps author should have been a separate column oops. Nice path sorting is another thing
    // that we'd need to thinking about, now we are sorting by the internal UID.
    if (!authorUsername) {
      throw new lib.ValidationError(`author must be given`)
    }
    let author
    if (authorUsername) {
      author = await User.findOne({ where: { username: authorUsername } })
      if (!author) {
        throw new lib.ValidationError(`username does not exist: "${authorUsername}"`, 404)
      }
    }
    const where = {}
    if (author) {
      where.path = sequelizeWhereStartsWith(sequelize, Upload.uidAndPathToUploadPath(author.id, ''), 'path')
    }
    const { count, rows: uploads } = await Upload.findAndCountAll({
      attributes: ['path', 'hash'],
      limit,
      offset,
      order: [['path', 'ASC']],
      where,
    })
    return res.json({
      uploads: uploads.map(upload => { return {
        hash: upload.hash,
        path: `${authorUsername}${URL_SEP}${upload.path.split(URL_SEP).slice(2).join(URL_SEP)}`,
      }}),
      count,
    })
  } catch(error) {
    next(error);
  }
})

module.exports = {
  get,
  router,
}
