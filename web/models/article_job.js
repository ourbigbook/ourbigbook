const { DataTypes, Op } = require('sequelize')

const timeoutMs = 20 * 60 * 1000

module.exports = sequelize => {
  const Job = sequelize.define('ArticleJob', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    activeUserId: { type: DataTypes.INTEGER, unique: true },
    requestId: { type: DataTypes.STRING, allowNull: false },
    requestHash: { type: DataTypes.STRING, allowNull: false },
    phase: { type: DataTypes.STRING, allowNull: false, defaultValue: 'render' },
    queuedAt: DataTypes.DATE,
    // Bounded staging payload; source bodies are discarded after extraction.
    items: { type: DataTypes.TEXT, allowNull: false },
    total: { type: DataTypes.INTEGER, allowNull: false },
    completed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'staged' },
    error: DataTypes.TEXT,
    finishedAt: DataTypes.DATE,
  }, { indexes: [
    { unique: true, fields: ['userId', 'requestId'] },
    { fields: ['userId', 'id'] },
    { fields: ['userId', 'status'] },
    { fields: ['status', 'queuedAt'] },
    { fields: ['status', 'createdAt'] },
  ] })

  Job.expire = async () => {
    await Job.update({
      status: 'failed', activeUserId: null, finishedAt: new Date(), items: '[]',
      error: 'Worker deadline exceeded. Rerun --web to resume; completed articles are saved.',
    }, { where: {
      status: { [Op.in]: ['pending', 'running'] },
      queuedAt: { [Op.lt]: new Date(Date.now() - timeoutMs) },
    } })
    await Job.update({ status: 'failed', items: '[]', finishedAt: new Date(), error: 'Staged upload expired; rerun --web.' }, {
      where: { status: 'staged', createdAt: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
  }

  Job.launch = job => sequelize.models.TreeRebuildJob.launch(job, { articles: true })

  Job.start = async job => {
    let changed
    try {
      ;[changed] = await Job.update({ status: 'pending', activeUserId: job.userId, queuedAt: new Date() }, {
        where: { id: job.id, status: 'staged' },
      })
    } catch (error) {
      if (error.name !== 'SequelizeUniqueConstraintError') throw error
      throw new (require('../api/lib').ValidationError)('Another bulk job is active for this user', 409)
    }
    if (changed) {
      try {
        await Job.launch(job)
      } catch (error) {
        await Job.update({
          status: 'failed', activeUserId: null, finishedAt: new Date(),
          error: 'Could not launch bulk worker. Check worker configuration and rerun --web.',
        }, { where: { id: job.id, status: 'pending' } })
      }
    }
    return job.reload()
  }

  Job.run = async id => {
    const [claimed] = await Job.update({ status: 'running' }, {
      where: { id, status: 'pending', queuedAt: { [Op.gte]: new Date(Date.now() - timeoutMs) } },
    })
    if (!claimed) return
    let currentPath
    try {
      const initial = await Job.findByPk(id)
      const items = JSON.parse(initial.items)
      const { createOrUpdateArticleData } = require('../api/articles')
      const { cant } = require('../front/cant')
      for (let i = initial.completed; i < items.length; i++) {
        const { hash, ...body } = items[i]
        currentPath = body.path
        // Conversion and its checkpoint commit together. A crash cannot mark
        // an uncommitted render as complete or roll back earlier articles.
        await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
          if (sequelize.getDialect() === 'postgres') {
            await sequelize.query("SET LOCAL statement_timeout = '10min'", { transaction })
            await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction })
          }
          const job = await Job.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
          if (job.status !== 'running' || Date.now() - job.queuedAt.getTime() >= timeoutMs) {
            throw new Error('Render job expired')
          }
          const user = await sequelize.models.User.findByPk(job.userId, { transaction })
          const denied = cant.editArticle(user, user && user.username)
          if (denied) throw new Error(String(denied))
          if (job.phase === 'check') {
            await sequelize.models.User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE })
            const file = await sequelize.models.File.findOne({ where: { authorId: user.id, path: `@${user.username}/${body.path}.bigb` }, transaction })
            if (!file || file.hash !== hash) throw new Error(`Source changed before check: ${body.path}`)
            const errors = await require('../convert').checkArticleDb(sequelize, [file.path], user, { transaction })
            if (errors.length) throw new (require('../api/lib').ValidationError)(errors)
          } else {
            await createOrUpdateArticleData(sequelize, job.userId, body, {
              forceNew: false, expectedHash: job.phase === 'extract' ? undefined : hash, skipJson: true, transaction,
            })
          }
          await job.update({
            completed: i + 1,
            ...(i + 1 === items.length
              ? { status: 'completed', activeUserId: null, finishedAt: new Date(), items: JSON.stringify(items.map(item => ({ ...item, article: {} }))) } : {}),
          }, { transaction })
        })
        console.log(`web_${initial.phase}: job ${id}: ${i + 1}/${items.length}: ${currentPath}`)
      }
    } catch (error) {
      const validation = error instanceof require('../api/lib').ValidationError
        ? (Array.isArray(error.errors) ? error.errors.join('\n') : String(error.errors)).slice(0, 4000)
        : ''
      await Job.update({
        status: 'failed', activeUserId: null, finishedAt: new Date(),
        items: '[]',
        error: `Bulk processing failed at ${currentPath || 'startup'}. ${validation ? `${validation}\n` : ''}Rerun --web to resume. Check worker logs for details.`,
      }, { where: { id, status: 'running' } })
      throw error
    }
  }
  return Job
}
