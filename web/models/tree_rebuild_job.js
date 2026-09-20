const { DataTypes, Op } = require('sequelize')
const config = require('../front/config')

// Includes dyno startup time. Workers must not commit after this deadline.
const timeoutMs = 20 * 60 * 1000

module.exports = sequelize => {
  const Job = sequelize.define('TreeRebuildJob', {
    userId: { type: DataTypes.INTEGER, allowNull: false },
    // NULL on terminal jobs, unique while active (also works on SQLite).
    activeUserId: { type: DataTypes.INTEGER, unique: true },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
    error: DataTypes.TEXT,
    finishedAt: DataTypes.DATE,
    startedAt: DataTypes.DATE,
  })

  Job.expire = async () => Job.update({
    status: 'failed', activeUserId: null, finishedAt: new Date(),
    error: 'Rebuild deadline exceeded. Run --web-nested-set again to retry.',
  }, { where: {
    status: { [Op.in]: ['pending', 'running'] },
    id: { [Op.notIn]: sequelize.literal(`(SELECT "jobId" FROM "BuildQueue" WHERE "kind" = 'TreeRebuildJob' AND ("status" != 'finished' OR "activeSlot" IS NOT NULL))`) },
    updatedAt: { [Op.lt]: new Date(Date.now() - timeoutMs) },
  } })

  Job.enqueue = async userId => {
    await Job.expire()
    return sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
      await sequelize.models.User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE })
      const active = await Job.findOne({ where: { activeUserId: userId }, transaction })
      if (active) return [active, false]
      // Standalone tree updates also retain just their latest result.
      await Job.destroy({ where: { userId, status: ['completed', 'failed'] }, transaction })
      await sequelize.models.BuildQueue.removeFinished(userId, transaction)
      return [await Job.create({ userId, activeUserId: userId }, { transaction }), true]
    })
  }

  Job.useBackground = () => !config.isProduction || Boolean(process.env.OURBIGBOOK_HEROKU_APP)

  // Development always uses its own database, even if Heroku settings were
  // inherited from the developer's shell.
  Job.launch = (job, options) => sequelize.models.BuildQueue.enqueue(job, options)
  Job.launchWorker = (job, options) => config.isProduction ? Job.launchHeroku(job, options) : Job.launchLocal(job, options)

  Job.launchHeroku = async (job, { articles = false, queueId, workerToken } = {}) => {
    const axios = require('axios')
    const launchError = message => {
      // Only explicitly selected diagnostic text crosses into logs/job history.
      // Heroku can echo request values; never include axios config or headers.
      for (const secret of [process.env.OURBIGBOOK_HEROKU_TOKEN, workerToken]) {
        if (secret) message = message.split(secret).join('[redacted]')
      }
      message = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/[\r\n\t]/g, ' ').slice(0, 1000)
      const error = new Error(message)
      error.workerLaunchMessage = message
      return error
    }
    const missing = ['OURBIGBOOK_HEROKU_APP', 'OURBIGBOOK_HEROKU_TOKEN'].filter(key => !process.env[key])
    if (missing.length) {
      throw launchError(`Could not launch build worker: missing ${missing.join(', ')}. Set these config vars on the Heroku app.`)
    }
    try {
      const response = await axios.post(
        `https://api.heroku.com/apps/${encodeURIComponent(process.env.OURBIGBOOK_HEROKU_APP)}/dynos`,
        {
          command: `node web/bin/background-worker.js ${job.id}${articles ? ' --articles' : ''}${queueId ? ` --queue ${queueId} --worker-token ${workerToken}` : ''}`,
          attach: false,
          time_to_live: 900,
          ...(process.env.OURBIGBOOK_HEROKU_WORKER_SIZE
            ? { size: process.env.OURBIGBOOK_HEROKU_WORKER_SIZE } : {}),
        },
        {
          timeout: 10000,
          maxRedirects: 0,
          headers: {
            Accept: 'application/vnd.heroku+json; version=3',
            Authorization: `Bearer ${process.env.OURBIGBOOK_HEROKU_TOKEN}`,
          },
        },
      )
      if (queueId) await sequelize.models.BuildQueue.update({ dynoId: response.data.id }, { where: { id: queueId, workerToken } })
    } catch (error) {
      const status = error.response && error.response.status
      const code = ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code) ? error.code : 'request failed'
      const data = error.response && error.response.data
      const detail = data && typeof data.message === 'string' ? ': ' + data.message : ''
      throw launchError(`Could not launch build worker (Heroku ${Number.isInteger(status) ? 'HTTP ' + status : code})${detail}`)
    }
  }

  Job.herokuStopped = async dynoId => {
    try {
      const response = await require('axios').get(
        `https://api.heroku.com/apps/${encodeURIComponent(process.env.OURBIGBOOK_HEROKU_APP)}/dynos/${encodeURIComponent(dynoId)}`,
        { timeout: 10000, maxRedirects: 0, headers: {
          Accept: 'application/vnd.heroku+json; version=3',
          Authorization: `Bearer ${process.env.OURBIGBOOK_HEROKU_TOKEN}`,
        } },
      )
      return response.data.state === 'down'
    } catch (error) {
      // Unknown state is not permission to launch another billable dyno.
      return Boolean(error.response && error.response.status === 404)
    }
  }

  Job.localProcessIdentity = pid => {
    try {
      const fs = require('fs')
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
      return `${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]}`
    } catch { return null }
  }

  Job.localWorkerStopped = root => {
    if (!root.localPid || root.localHost !== require('os').hostname()) return false
    try { process.kill(root.localPid, 0) } catch (error) { return error.code === 'ESRCH' }
    // kill(pid, 0) also succeeds for an exited child awaiting reaping. This
    // happens when a server restart leaves the worker with a different parent.
    try {
      const stat = require('fs').readFileSync(`/proc/${root.localPid}/stat`, 'utf8')
      if (['Z', 'X'].includes(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0])) return true
    } catch { /* Preserve the conservative identity check on non-Linux hosts. */ }
    const identity = Job.localProcessIdentity(root.localPid)
    return Boolean(identity && root.localIdentity && identity !== root.localIdentity)
  }

  Job.launchLocal = async (job, { articles = false, queueId, workerToken } = {}) => {
    const path = require('path')
    const dialect = sequelize.getDialect()
    const storage = sequelize.options.storage
    if (dialect === 'sqlite' && (!storage || storage === ':memory:')) {
      throw new Error('Local rebuild workers require a file-backed SQLite database or PostgreSQL')
    }
    const child = require('child_process').fork(
      path.join(__dirname, '../bin/background-worker.js'), [String(job.id), '--local', ...(articles ? ['--articles'] : []), ...(queueId ? ['--queue', String(queueId), '--worker-token', workerToken] : [])],
      {
        cwd: path.join(__dirname, '..'),
        // Do not inherit an inspector port or the test runner's preload hooks.
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    )
    let spawnError
    child.on('error', error => { spawnError = error })
    child.once('exit', (code, signal) => {
      if (queueId) {
        child.buildQueueExit = sequelize.models.BuildQueue.workerExited(queueId, workerToken)
          .catch(() => console.error(`Could not record local build worker ${queueId} exit; job will expire`))
        return
      }
      if (code === 0) return
      // A crash can happen before the worker connects to the database. Report
      // it promptly, without overwriting a committed completion/failure.
      const model = articles ? sequelize.models.ArticleJob : Job
      model.update({
        status: 'failed', activeUserId: null, finishedAt: new Date(),
        error: articles
          ? `Local article worker exited before completing (${signal || code}). Rerun --web to resume.`
          : `Local rebuild worker exited before completing (${signal || code}). Retry --web-nested-set.`,
      }, { where: { id: job.id, status: { [Op.in]: ['pending', 'running'] } } })
        .catch(() => console.error(`Could not record local rebuild worker ${job.id} exit; job will expire`))
    })
    if (queueId) await sequelize.models.BuildQueue.update({
      localPid: child.pid, localHost: require('os').hostname(), localIdentity: Job.localProcessIdentity(child.pid),
    }, { where: { id: queueId, workerToken, status: 'launched' } })
    await new Promise((resolve, reject) => {
      if (spawnError) { reject(spawnError); return }
      child.once('error', reject)
      // IPC avoids exposing database credentials in command arguments and
      // preserves overrides (notably local PostgreSQL SSL and SQLite paths).
      child.send({
        ...sequelize.config,
        dialect,
        dialectOptions: sequelize.options.dialectOptions,
        ...(dialect === 'sqlite' ? { storage: path.resolve(storage) } : {}),
      }, error => error ? reject(error) : resolve())
    })
    return child
  }

  Job.run = async id => {
    const [claimed] = await Job.update({ status: 'running', startedAt: sequelize.fn('COALESCE', sequelize.col('startedAt'), new Date()) }, {
      where: { id, status: 'pending', updatedAt: { [Op.gte]: new Date(Date.now() - timeoutMs) } },
    })
    if (!claimed) return
    try {
      await sequelize.transaction(sequelize.getDialect() === 'sqlite' ? { type: 'IMMEDIATE' } : {}, async transaction => {
        if (sequelize.options.dialect === 'postgres') {
          await sequelize.query("SET LOCAL statement_timeout = '10min'", { transaction })
          await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction })
        }
        let job = await Job.findByPk(id, { transaction })
        if (!job) return
        const user = await sequelize.models.User.findByPk(job.userId, { transaction, lock: transaction.LOCK.UPDATE })
        if (!user) throw new Error('Rebuild user no longer exists')
        job = await Job.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
        if (!job || job.status !== 'running') return
        const build = await sequelize.models.ArticleBuild.findOne({ where: { treeJobId: id }, transaction })
        if (build && build.status !== 'running') throw new Error('Build replaced or cancelled')
        await sequelize.models.Article.updateNestedSets(user.username, { transaction })
        await user.update({ nestedSetNeedsUpdate: false }, { transaction })
        const [completed] = await Job.update({
          status: 'completed', activeUserId: null, finishedAt: new Date(),
        }, { transaction, where: {
          id, status: 'running', updatedAt: { [Op.gte]: new Date(Date.now() - timeoutMs) },
        } })
        if (!completed) throw new Error('Rebuild expired; rolling back')
      })
    } catch (error) {
      await Job.update({
        status: 'failed', activeUserId: null, finishedAt: new Date(),
        error: 'Tree rebuild failed. Check worker logs and retry --web-nested-set.',
      }, { where: { id, status: 'running' } })
      throw error
    }
  }
  return Job
}
