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
  })

  Job.expire = async () => Job.update({
    status: 'failed', activeUserId: null, finishedAt: new Date(),
    error: 'Rebuild deadline exceeded. Run --web-nested-set again to retry.',
  }, { where: {
    status: { [Op.in]: ['pending', 'running'] },
    createdAt: { [Op.lt]: new Date(Date.now() - timeoutMs) },
  } })

  Job.enqueue = async userId => {
    await Job.expire()
    return Job.findOrCreate({ where: { activeUserId: userId }, defaults: { userId } })
  }

  Job.useBackground = () => !config.isProduction || Boolean(process.env.OURBIGBOOK_HEROKU_APP)

  // Development always uses its own database, even if Heroku settings were
  // inherited from the developer's shell.
  Job.launch = job => config.isProduction ? Job.launchHeroku(job) : Job.launchLocal(job)

  Job.launchHeroku = async job => {
    const axios = require('axios')
    if (!process.env.OURBIGBOOK_HEROKU_APP || !process.env.OURBIGBOOK_HEROKU_TOKEN) {
      throw new Error('Configure OURBIGBOOK_HEROKU_APP and OURBIGBOOK_HEROKU_TOKEN')
    }
    try {
      await axios.post(
        `https://api.heroku.com/apps/${encodeURIComponent(process.env.OURBIGBOOK_HEROKU_APP)}/dynos`,
        {
          command: `node web/bin/tree-rebuild-worker.js ${job.id}`,
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
    } catch (error) {
      // Never log axios errors: their config contains the Heroku credential.
      throw new Error(`Could not launch rebuild worker (Heroku ${error.response ? error.response.status : 'request failed'}). Retry --web-nested-set.`)
    }
  }

  Job.launchLocal = async job => {
    const path = require('path')
    const dialect = sequelize.getDialect()
    const storage = sequelize.options.storage
    if (dialect === 'sqlite' && (!storage || storage === ':memory:')) {
      throw new Error('Local rebuild workers require a file-backed SQLite database or PostgreSQL')
    }
    const child = require('child_process').fork(
      path.join(__dirname, '../bin/tree-rebuild-worker.js'), [String(job.id), '--local'],
      {
        cwd: path.join(__dirname, '..'),
        // Do not inherit an inspector port or the test runner's preload hooks.
        execArgv: [],
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      },
    )
    child.once('exit', (code, signal) => {
      if (code === 0) return
      // A crash can happen before the worker connects to the database. Report
      // it promptly, without overwriting a committed completion/failure.
      Job.update({
        status: 'failed', activeUserId: null, finishedAt: new Date(),
        error: `Local rebuild worker exited before completing (${signal || code}). Retry --web-nested-set.`,
      }, { where: { id: job.id, status: { [Op.in]: ['pending', 'running'] } } })
        .catch(() => console.error(`Could not record local rebuild worker ${job.id} exit; job will expire`))
    })
    await new Promise((resolve, reject) => {
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
    const [claimed] = await Job.update({ status: 'running' }, {
      where: { id, status: 'pending', createdAt: { [Op.gte]: new Date(Date.now() - timeoutMs) } },
    })
    if (!claimed) return
    try {
      await sequelize.transaction(async transaction => {
        if (sequelize.options.dialect === 'postgres') {
          await sequelize.query("SET LOCAL statement_timeout = '10min'", { transaction })
          await sequelize.query("SET LOCAL lock_timeout = '10s'", { transaction })
        }
        const job = await Job.findByPk(id, { transaction })
        const user = await sequelize.models.User.findByPk(job.userId, { transaction, lock: transaction.LOCK.UPDATE })
        if (!user) throw new Error('Rebuild user no longer exists')
        await sequelize.models.Article.updateNestedSets(user.username, { transaction })
        await user.update({ nestedSetNeedsUpdate: false }, { transaction })
        const [completed] = await Job.update({
          status: 'completed', activeUserId: null, finishedAt: new Date(),
        }, { transaction, where: {
          id, status: 'running', createdAt: { [Op.gte]: new Date(Date.now() - timeoutMs) },
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
