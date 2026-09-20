const { DataTypes, Op } = require('sequelize')

module.exports = sequelize => {
  const Build = sequelize.define('ArticleBuild', {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    activeUserId: { type: DataTypes.INTEGER, unique: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'staged' },
    jobCount: DataTypes.INTEGER,
    rebuildTree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    treeJobId: DataTypes.INTEGER,
    error: DataTypes.TEXT,
    finishedAt: DataTypes.DATE,
  }, { indexes: [{ fields: ['userId', 'status'] }, { fields: ['status', 'id'] }, { fields: ['treeJobId'] }] })
  const transactionOptions = () => sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}
  const invalid = (message, status=422) => new (require('../api/lib').ValidationError)(message, status)

  Build.assertIdle = async (userId, transaction) => {
    if (await Build.findOne({ where: { activeUserId: userId }, transaction }) ||
        await sequelize.models.ArticleJob.findOne({ where: { activeUserId: userId }, transaction })) {
      throw invalid('Another bulk job is active for this user', 409)
    }
  }

  Build.commit = async (id, userId, jobCount, rebuildTree) => {
    const { User, ArticleJob } = sequelize.models
    await sequelize.transaction(transactionOptions(), async transaction => {
      await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE })
      const build = await Build.findOne({ where: { id, userId }, transaction, lock: transaction.LOCK.UPDATE })
      if (!build) throw invalid('Build not found', 404)
      if (build.status !== 'staged') {
        if (build.jobCount !== jobCount || build.rebuildTree !== rebuildTree) throw invalid('Build already submitted with different options', 409)
        return
      }
      await Build.assertIdle(userId, transaction)
      // Inspect only small job metadata, never all source payloads.
      const jobs = await ArticleJob.findAll({
        attributes: ['id', 'phase', 'status', 'buildIndex', 'batchIndex', 'batchCount'],
        where: { buildId: id, userId }, order: [['buildIndex', 'ASC']], transaction,
      })
      if (jobs.length !== jobCount) throw invalid('Build is incomplete')
      let previousPhase = -1
      const counts = {}
      for (const job of jobs) counts[job.phase] = (counts[job.phase] || 0) + 1
      const indices = {}
      for (const [i, job] of jobs.entries()) {
        const phase = ['extract', 'check', 'render'].indexOf(job.phase)
        const index = indices[job.phase] || 0
        if (job.status !== 'staged' || job.buildIndex !== i || phase < 0 || phase < previousPhase ||
            job.batchIndex !== index || job.batchCount !== counts[job.phase]) throw invalid('Invalid or incomplete build order')
        indices[job.phase] = index + 1
        previousPhase = phase
      }
      // "waiting" means committed; unlike staged uploads it must not expire.
      await ArticleJob.update({ status: 'waiting' }, { where: { buildId: id }, transaction })
      await build.update({ status: 'running', activeUserId: userId, jobCount, rebuildTree }, { transaction })
    })
  }

  Build.advance = async userId => {
    const { User, ArticleJob, TreeRebuildJob, BuildQueue } = sequelize.models
    const builds = await Build.findAll({ attributes: ['id', 'userId'], where: {
      status: 'running', ...(userId === undefined ? {} : { userId }),
    } })
    for (const candidate of builds) await sequelize.transaction(transactionOptions(), async transaction => {
      // Same lock order as commit and standalone Job.start.
      await User.findByPk(candidate.userId, { transaction, lock: transaction.LOCK.UPDATE })
      const build = await Build.findByPk(candidate.id, { transaction, lock: transaction.LOCK.UPDATE })
      if (build.status !== 'running') return
      const finish = async (error=null) => {
        if (error) await ArticleJob.update({ status: 'failed', error: 'Build stopped after an earlier job failed.', items: '[]', finishedAt: new Date() }, {
          where: { buildId: build.id, status: 'waiting' }, transaction,
        })
        await build.update({ status: error ? 'failed' : 'completed', error, activeUserId: null, finishedAt: new Date() }, { transaction })
      }
      const job = await ArticleJob.findOne({
        attributes: ['id', 'status', 'error'], where: { buildId: build.id, status: { [Op.ne]: 'completed' } },
        order: [['buildIndex', 'ASC']], transaction,
      })
      if (job) {
        if (job.status === 'failed') return finish(job.error || `Job ${job.id} failed`)
        if (job.status !== 'waiting') return
        // Checkpoint activation and queue insertion are one durable operation.
        await job.update({ status: 'queued', activeUserId: build.userId, queuedAt: new Date() }, { transaction })
        await BuildQueue.create({ userId: build.userId, kind: 'ArticleJob', jobId: job.id }, { transaction })
        return
      }
      if (build.rebuildTree) {
        if (build.treeJobId) {
          const tree = await TreeRebuildJob.findByPk(build.treeJobId, { transaction })
          if (tree.status === 'failed') return finish(tree.error || 'Tree rebuild failed')
          if (tree.status !== 'completed') return
        } else {
          // An unrelated earlier tree job must finish before creating ours.
          if (await TreeRebuildJob.findOne({ where: { activeUserId: build.userId }, transaction })) return
          const tree = await TreeRebuildJob.create({ userId: build.userId, activeUserId: build.userId, status: 'queued' }, { transaction })
          await BuildQueue.create({ userId: build.userId, kind: 'TreeRebuildJob', jobId: tree.id }, { transaction })
          await build.update({ treeJobId: tree.id }, { transaction })
          return
        }
      }
      await finish()
    })
  }
  return Build
}
