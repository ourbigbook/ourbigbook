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
  }, { indexes: [
    { unique: true, fields: ['kind', 'jobId'] },
    { fields: ['status', 'id'] },
    { fields: ['workerId'] },
  ] })
  // Deleting an account must not delete the semaphore for a still-live worker.
  Queue.belongsTo(sequelize.models.User, { foreignKey: 'userId', as: 'user', constraints: false })
  const model = entry => sequelize.models[entry.kind]
  const markPending = (entry, transaction) => model(entry).update({
    status: 'pending', ...(entry.kind === 'ArticleJob' ? { queuedAt: new Date() } : {}),
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
          await Queue.workerExited(root.id)
        }
      }
    }
    // Dead workers cannot hold a slot forever. Never reclaim earlier than the
    // platform/local hard deadline, including when launch success is unknown.
    const expired = await Queue.findAll({ where: {
      activeSlot: { [Op.ne]: null }, expiresAt: { [Op.lt]: new Date() },
    } })
    for (const entry of expired) {
      await model(entry).update({ status: 'failed', activeUserId: null, finishedAt: new Date(),
        error: 'Build worker expired. Retry the upload.',
      }, { where: { id: entry.jobId, status: { [Op.in]: ['pending', 'running'] } } })
      await Queue.update({ activeSlot: null, status: 'finished' }, {
        where: { id: entry.id, expiresAt: { [Op.lt]: new Date() } },
      })
    }
    const user = userId && await sequelize.models.User.findByPk(userId)
    // Shared workers never depend on who happens to poll their status.
    const lanes = [{ slot: 'shared', where: { dedicatedBuildWorker: false } }]
    if (user && user.dedicatedBuildWorker) lanes.push({ slot: `user-${userId}`, where: { id: userId } })
    for (const lane of lanes) {
      let entry
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
          const [claimed] = await Queue.update({ status: 'launched', activeSlot: lane.slot, workerId: entry.id,
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
          articles: entry.kind === 'ArticleJob', queueId: entry.id,
        })
      } catch (error) {
        await model(entry).update({ status: 'failed', activeUserId: null, finishedAt: new Date(),
          error: 'Could not launch build worker. Check worker configuration and retry.',
        }, { where: { id: entry.jobId, status: 'pending' } })
        // Do not release: a timed-out launch could still be running.
      }
    }
  }

  Queue.workerExited = async workerId => {
    const entries = await Queue.findAll({ where: { workerId, activeSlot: { [Op.ne]: null } } })
    for (const entry of entries) {
      await model(entry).update({ status: 'failed', activeUserId: null, finishedAt: new Date(),
        error: 'Build worker exited before completing. Retry the upload.',
      }, { where: { id: entry.jobId, status: { [Op.in]: ['pending', 'running'] } } })
      await Queue.update({ status: 'finished', activeSlot: null }, { where: { id: entry.id, workerId } })
    }
  }

  Queue.run = async id => {
    let entry = await Queue.findByPk(id)
    if (!entry || entry.status !== 'launched' || !entry.activeSlot || entry.expiresAt <= new Date()) return
    // Only one process may execute a successfully launched queue entry.
    const [claimed] = await Queue.update({ status: 'running' }, { where: { id, status: 'launched' } })
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
            await next.update({ status: 'running', activeSlot: entry.activeSlot, expiresAt: entry.expiresAt, workerId: entry.workerId }, { transaction })
            await markPending(next, transaction)
          }
        })
        entry = next
      }
    } finally {
      clearTimeout(deadline)
    }
  }
  Queue.tick = async () => {
    await Queue.kick()
    const waiting = await Queue.findAll({ attributes: ['userId'], where: { status: 'queued' },
      include: [{ model: sequelize.models.User, as: 'user', attributes: [], where: { dedicatedBuildWorker: true } }],
      group: ['BuildQueue.userId'], raw: true,
    })
    for (const entry of waiting) await Queue.kick(entry.userId)
  }
  return Queue
}
