const { DataTypes, Op } = require('sequelize')
const config = require('../front/config')

// Longer than the worker's hard 15-minute lifetime. An ambiguous launch must
// retain its slot: the platform may have started the dyno despite a timeout.
const leaseMs = 20 * 60 * 1000

module.exports = sequelize => {
  const Queue = sequelize.define('BuildQueue', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING, allowNull: false },
    jobId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'queued' },
    activeSlot: { type: DataTypes.STRING, unique: true },
    expiresAt: DataTypes.DATE,
    workerId: DataTypes.INTEGER,
    dynoId: DataTypes.STRING,
    checkedAt: DataTypes.DATE,
    workerToken: DataTypes.STRING,
    localPid: DataTypes.INTEGER,
    localHost: DataTypes.STRING,
    localIdentity: DataTypes.STRING,
    recoveries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    checkpoint: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, { indexes: [
    { unique: true, fields: ['kind', 'jobId'] },
    { fields: ['status', 'id'] },
    { fields: ['workerId'] },
  ] })
  // Deleting an account must not delete the semaphore for a still-live worker.
  Queue.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user', constraints: false })
  const model = entry => sequelize.models[entry.kind]
  const markPending = (entry, transaction) => model(entry).update({
    status: 'pending', error: null, ...(entry.kind === 'ArticleJob' ? { queuedAt: new Date() } : {}),
  }, { where: { id: entry.jobId, status: 'queued' }, transaction })

  Queue.enqueue = async (job, { articles = false } = {}) => {
    const kind = articles ? 'ArticleJob' : 'TreeRebuildJob'
    await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
      const [, created] = await Queue.findOrCreate({
        where: { kind, jobId: job.id }, defaults: { userId: job.userId }, transaction,
      })
      if (created) await model({ kind }).update({ status: 'queued' }, {
        where: { id: job.id, status: 'pending' }, transaction,
      })
    })
    await Queue.kick(job.userId)
  }

  Queue.kick = async userId => {
    if (config.isProduction) {
      const active = await Queue.findAll({ where: { activeSlot: { [Op.ne]: null } } })
      for (const entry of active) {
        const root = await Queue.findByPk(entry.workerId)
        if (!root || !root.dynoId) continue
        const [check] = await Queue.update({ checkedAt: new Date() }, { where: {
          id: root.id, [Op.or]: [{ checkedAt: null }, { checkedAt: { [Op.lt]: new Date(Date.now() - 5000) } }],
        } })
        if (check && await sequelize.models.TreeRebuildJob.herokuStopped(root.dynoId)) {
          await Queue.workerExited(root.id, root.workerToken)
        }
      }
    } else {
      const active = await Queue.findAll({ where: { activeSlot: { [Op.ne]: null } } })
      for (const entry of active) {
        const root = await Queue.findByPk(entry.workerId)
        if (root && sequelize.models.TreeRebuildJob.localWorkerStopped(root)) {
          await Queue.workerExited(root.id, root.workerToken)
        }
      }
    }
    // Dead workers cannot hold a slot forever. Never reclaim earlier than the
    // platform/local hard deadline, including when launch success is unknown.
    const expired = await Queue.findAll({ where: {
      activeSlot: { [Op.ne]: null }, expiresAt: { [Op.lt]: new Date() },
    } })
    for (const entry of expired) {
      const root = await Queue.findByPk(entry.workerId)
      // Prefer positive termination evidence whenever we have an identity.
      // The lease fallback is for old workers / ambiguous launches only.
      if (config.isProduction && root && root.dynoId) continue
      if (!config.isProduction && root && root.localPid && root.localHost === require('os').hostname() &&
          !sequelize.models.TreeRebuildJob.localWorkerStopped(root)) continue
      await Queue.workerExited(entry.workerId, entry.workerToken)
    }
    const user = userId && await sequelize.models.User.findByPk(userId)
    // Shared workers never depend on who happens to poll their status.
    const lanes = [{ slot: 'shared', where: { dedicatedBuildWorker: false } }]
    if (user && user.dedicatedBuildWorker) lanes.push({ slot: `user-${userId}`, where: { id: userId } })
    for (const lane of lanes) {
      let entry
      const workerToken = require('crypto').randomUUID()
      try {
        await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
          if (await Queue.findOne({ where: { activeSlot: lane.slot }, transaction })) return
          entry = await Queue.findOne({
            where: { status: 'queued' },
            include: [{ model: sequelize.models.User, as: 'user', where: lane.where, attributes: [] }],
            order: [['id', 'ASC']], transaction,
          })
          if (!entry) return
          // Unique activeSlot is the cross-process semaphore. The conditional
          // update also protects a queued entry from simultaneous dispatchers.
          const job = await model(entry).findByPk(entry.jobId, {
            attributes: entry.kind === 'ArticleJob' ? ['completed'] : ['id'], transaction,
          })
          const [claimed] = await Queue.update({ status: 'launched', activeSlot: lane.slot, workerId: entry.id, workerToken,
            dynoId: null, checkedAt: null, localPid: null, localHost: null, localIdentity: null, checkpoint: job.completed || 0,
            expiresAt: new Date(Date.now() + leaseMs),
          }, { where: { id: entry.id, status: 'queued' }, transaction })
          if (!claimed) { entry = null; return }
          await markPending(entry, transaction)
        })
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') continue
        throw error
      }
      if (!entry) continue
      try {
        const job = await model(entry).findByPk(entry.jobId)
        await sequelize.models.TreeRebuildJob.launchWorker(job, {
          articles: entry.kind === 'ArticleJob', queueId: entry.id, workerToken,
        })
      } catch (error) {
        await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
          const current = await Queue.findOne({
            where: { id: entry.id, workerToken, status: 'launched' }, transaction, lock: transaction.LOCK.UPDATE,
          })
          if (current) await model(entry).update({ status: 'failed', activeUserId: null, finishedAt: new Date(),
            error: 'Could not launch build worker. Check worker configuration and retry.',
          }, { where: { id: entry.jobId, status: 'pending' }, transaction })
        })
        // Do not release: a timed-out launch could still be running.
      }
    }
  }

  Queue.workerExited = async (workerId, workerToken) => {
    const where = { workerId, ...(workerToken ? { workerToken } : {}), activeSlot: { [Op.ne]: null } }
    const entries = await Queue.findAll({ where })
    for (const entry of entries) {
      await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
        const current = await Queue.findOne({ where: { ...where, id: entry.id }, transaction, lock: transaction.LOCK.UPDATE })
        if (!current) return
        const job = await model(current).findByPk(current.jobId, { transaction, lock: transaction.LOCK.UPDATE })
        const interrupted = job && ['pending', 'running'].includes(job.status)
        const recoveries = interrupted ? (job.completed > current.checkpoint ? 0 : current.recoveries + 1) : current.recoveries
        const retry = interrupted && recoveries <= 3
        if (interrupted) await job.update(retry ? {
          status: 'queued', error: null,
        } : {
          status: 'failed', activeUserId: null, finishedAt: new Date(),
          error: 'Build worker repeatedly exited without progress. Check worker logs and retry the upload.',
        }, { transaction })
        await current.update({ status: retry ? 'queued' : 'finished', activeSlot: null, recoveries }, { transaction })
      })
    }
  }

  Queue.run = async (id, workerToken) => {
    let entry = await Queue.findByPk(id)
    if (!entry || (workerToken && entry.workerToken !== workerToken) || entry.status !== 'launched' || !entry.activeSlot || entry.expiresAt <= new Date()) return
    // Only one process may execute a successfully launched queue entry.
    const [claimed] = await Queue.update({ status: 'running' }, { where: { id, status: 'launched', workerToken: entry.workerToken } })
    if (!claimed) return
    // A late-starting worker must stop before its lease can be reassigned.
    const deadline = setTimeout(() => process.exit(1), Math.max(1, entry.expiresAt.getTime() - Date.now() - 60000))
    const started = Date.now()
    try {
      while (entry) {
        try {
          await model(entry).run(entry.jobId)
        } catch (error) {
          // The job records its failure; other users must still get a turn.
          console.error(error)
        }
        await sequelize.models.ArticleBuild.advance(entry.userId)
        let next
        await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
          // Retain the slot across batches, rather than launching a new dyno
          // for every queued user. Both queue kinds share the same FIFO.
          if (Date.now() - started < 5 * 60 * 1000) {
            next = await Queue.findOne({ where: { status: 'queued' },
              include: [{ model: sequelize.models.User, as: 'user', attributes: [], where:
                entry.activeSlot === 'shared' ? { dedicatedBuildWorker: false } : { id: entry.userId, dedicatedBuildWorker: true },
              }], order: [['id', 'ASC']], transaction,
            })
          }
          // At the end, retain the slot until local exit / the Heroku API
          // confirms termination. Even teardown must not overlap paid dynos.
          await Queue.update({ status: 'finished', ...(next ? { activeSlot: null } : {}) }, { where: { id: entry.id }, transaction })
          if (next) {
            const job = await model(next).findByPk(next.jobId, {
              attributes: next.kind === 'ArticleJob' ? ['completed'] : ['id'], transaction,
            })
            await next.update({ status: 'running', activeSlot: entry.activeSlot, expiresAt: entry.expiresAt, workerId: entry.workerId,
              workerToken: entry.workerToken, checkpoint: job.completed || 0,
            }, { transaction })
            await markPending(next, transaction)
          }
        })
        entry = next
      }
    } finally {
      clearTimeout(deadline)
    }
  }
  Queue.prune = async ({ now=new Date(), keep=1000 }={}) => {
    const { ArticleJob, ArticleBuild, TreeRebuildJob } = sequelize.models
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const replacements = { cutoff, keep }
    await ArticleJob.expire()
    await TreeRebuildJob.expire()
    await ArticleBuild.update({ status: 'failed', error: 'Unsubmitted build expired.', finishedAt: now }, {
      where: { status: 'staged', createdAt: { [Op.lt]: cutoff } },
    })
    // Rank article and tree jobs together so the limit is per user, not per
    // job type. Protect complete active/recent builds and live worker roots.
    for (let page = 0; page < 10; page++) {
      const rows = await sequelize.query(`SELECT "id", "kind" FROM (
        SELECT history.*, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY COALESCE("finishedAt", "createdAt") DESC, "id" DESC, "kind" ASC) AS "historyRank"
        FROM (${ArticleJob.historySql}) AS history WHERE "status" IN ('completed', 'failed')
      ) AS ranked WHERE "historyRank" > :keep AND COALESCE("finishedAt", "createdAt") < :cutoff
        AND NOT EXISTS (SELECT 1 FROM "ArticleBuild" b WHERE b."id" = ranked."buildId"
          AND (b."status" NOT IN ('completed', 'failed') OR COALESCE(b."finishedAt", b."createdAt") >= :cutoff))
        AND NOT EXISTS (SELECT 1 FROM "BuildQueue" q WHERE q."kind" = ranked."kind" AND q."jobId" = ranked."id"
          AND (q."activeSlot" IS NOT NULL OR q."id" IN (SELECT "workerId" FROM "BuildQueue" WHERE "activeSlot" IS NOT NULL)))
        LIMIT 1000`, { replacements, type: sequelize.QueryTypes.SELECT })
      if (!rows.length) break
      for (const kind of ['ArticleJob', 'TreeRebuildJob']) {
        const ids = rows.filter(row => row.kind === kind).map(row => row.id)
        if (ids.length) await sequelize.models[kind].destroy({ where: { id: ids, status: ['completed', 'failed'] } })
      }
    }
    for (let page = 0; page < 10; page++) {
      const rows = await sequelize.query(`SELECT "id" FROM (
        SELECT "id", "treeJobId", "finishedAt", "createdAt", ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY COALESCE("finishedAt", "createdAt") DESC, "id" DESC) AS "historyRank"
        FROM "ArticleBuild" WHERE "status" IN ('completed', 'failed')
      ) AS ranked WHERE "historyRank" > :keep AND COALESCE("finishedAt", "createdAt") < :cutoff
        AND NOT EXISTS (SELECT 1 FROM "ArticleJob" j WHERE j."buildId" = ranked."id")
        AND NOT EXISTS (SELECT 1 FROM "TreeRebuildJob" t WHERE t."id" = ranked."treeJobId") LIMIT 1000`, {
        replacements, type: sequelize.QueryTypes.SELECT,
      })
      if (!rows.length) break
      await ArticleBuild.destroy({ where: { id: rows.map(row => row.id), status: ['completed', 'failed'] } })
    }
    for (let page = 0; page < 10; page++) {
      const rows = await Queue.findAll({ attributes: ['id'], where: {
        status: 'finished', activeSlot: null, updatedAt: { [Op.lt]: cutoff },
        id: { [Op.notIn]: sequelize.literal('(SELECT "workerId" FROM "BuildQueue" WHERE "activeSlot" IS NOT NULL AND "workerId" IS NOT NULL)') },
      }, limit: 1000 })
      if (!rows.length) break
      await Queue.destroy({ where: { id: rows.map(row => row.id), status: 'finished', activeSlot: null } })
    }
  }
  let nextPruneAt = 0
  Queue.tick = async () => {
    await sequelize.models.ArticleBuild.advance()
    // A crash between recording a pending job and enqueueing it must not
    // require the uploader (or a status request) to submit it again.
    for (const kind of ['ArticleJob', 'TreeRebuildJob']) {
      const jobs = await sequelize.models[kind].findAll({ where: {
        status: 'pending',
        id: { [Op.notIn]: sequelize.literal(`(SELECT "jobId" FROM "BuildQueue" WHERE "kind" = '${kind}')`) },
      }, limit: 100, order: [['id', 'ASC']] })
      for (const job of jobs) await Queue.enqueue(job, { articles: kind === 'ArticleJob' })
    }
    await Queue.kick()
    const waiting = await Queue.findAll({ attributes: ['userId'], where: { status: 'queued' },
      include: [{ model: sequelize.models.User, as: 'user', attributes: [], where: { dedicatedBuildWorker: true } }],
      group: ['BuildQueue.userId'], raw: true,
    })
    for (const entry of waiting) await Queue.kick(entry.userId)
    if (!config.isTest && Date.now() >= nextPruneAt) {
      await Queue.prune()
      nextPruneAt = Date.now() + 60 * 60 * 1000
    }
  }
  return Queue
}
