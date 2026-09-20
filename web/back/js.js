const { AsyncLocalStorage } = require('async_hooks')
const fs = require('fs')
const { performance } = require('perf_hooks')
const path = require('path')

function preloadKatex() {
  // Other backend helpers are also used before the benchmark has detected the
  // server's dialect. Do not cache environment-dependent DB config on import.
  const ourbigbook_nodejs_webpack_safe = require('ourbigbook/nodejs_webpack_safe')
  return ourbigbook_nodejs_webpack_safe.preload_katex_from_file(
    path.join(path.dirname(require.resolve(path.join('ourbigbook', 'package.json'))), 'default.tex'))
}

const explainHeader = 'x-ourbigbook-explain'
const databaseDialectHeader = 'x-ourbigbook-db-dialect'
const defaultExplainDirectory = path.resolve(__dirname, '../../tmp/benchmark-explain')
const explainUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function explainDirectory(value) {
  return value === true || value === '1' ? defaultExplainDirectory : path.resolve(value)
}

// auto_explain instruments the original execution. Replaying SQL with EXPLAIN
// ANALYZE would execute writes twice and lose the original transaction context.
function installExplain(sequelize, outputDirectory) {
  if (sequelize.getDialect() !== 'postgres') throw new Error('OURBIGBOOK_EXPLAIN requires PostgreSQL')
  const output = explainDirectory(outputDirectory)
  fs.mkdirSync(output, { recursive: true, mode: 0o700 })
  const context = new AsyncLocalStorage()
  const queries = new Map()

  sequelize.addHook('afterConnect', async connection => {
    try {
      await connection.query(`LOAD 'auto_explain';
        SET auto_explain.log_min_duration = 0;
        SET auto_explain.log_analyze = on;
        SET auto_explain.log_buffers = on;
        SET auto_explain.log_timing = off;
        SET auto_explain.log_format = 'json';
        SET auto_explain.log_level = 'notice';
        SET auto_explain.log_nested_statements = off;
        SET auto_explain.sample_rate = 1;
        SET client_min_messages = notice;`)
    } catch (error) {
      await connection.end()
      throw new Error(`OURBIGBOOK_EXPLAIN could not load auto_explain (requires PostgreSQL superuser permission): ${error.message}`)
    }
    // Socket callbacks do not necessarily inherit the request's async context.
    // Identify the query by its SQL comment, including concurrent pooled queries.
    connection.on('notice', notice => {
      const match = notice.message.match(/^duration: ([\d.]+) ms\s+plan:\s*([\s\S]*)$/)
      if (!match) return
      const tag = match[2].match(/ourbigbook-explain:([0-9a-f-]+:\d+)/)
      const record = tag && queries.get(tag[1])
      if (!record) return
      try {
        record.plans.push({ duration_ms: Number(match[1]), ...JSON.parse(match[2]) })
      } catch (error) {
        record.error = `Could not decode auto_explain JSON: ${error.message}`
      }
    })
  })

  function save(trace) {
    if (!trace.finished || trace.pending || trace.saved) return
    trace.saved = true
    for (const record of trace.data.queries) {
      queries.delete(`${trace.data.request_id}:${record.query_id}`)
    }
    const filename = path.join(output, `${trace.data.request_id}.json`)
    try {
      fs.writeFileSync(`${filename}.tmp`, JSON.stringify(trace.data) + '\n', { mode: 0o600 })
      fs.renameSync(`${filename}.tmp`, filename)
    } catch (error) {
      console.error(`Could not save benchmark query plans: ${error.message}`)
    }
  }

  sequelize.addHook('beforeQuery', (options, query) => {
    const trace = context.getStore()
    if (!trace || trace.finished) return
    const run = query.run
    query.run = async function(sql, parameters) {
      const record = { query_id: trace.data.queries.length, sql, parameters: parameters || [], plans: [] }
      const tag = `${trace.data.request_id}:${record.query_id}`
      trace.data.queries.push(record)
      trace.pending++
      queries.set(tag, record)
      const start = performance.now()
      try {
        return await run.call(this, `/* ourbigbook-explain:${tag} */ ${sql}`, parameters)
      } catch (error) {
        record.error = error.message
        throw error
      } finally {
        record.elapsed_ms = performance.now() - start
        // Bound SELECT plans inside a transaction can arrive only when its
        // portal closes (e.g. at COMMIT). Retain the association until the
        // request finishes, even though the rows have already been returned.
        trace.pending--
        save(trace)
      }
    }
  })

  return (req, res, next) => {
    // Also advertise instrumentation on untraced requests, so benchmark timings
    // cannot silently be mistaken for runs without auto_explain overhead.
    res.setHeader(explainHeader, 'auto_explain')
    const requestId = req.get(explainHeader)
    if (!requestId) return next()
    if (!explainUuidPattern.test(requestId)) return res.status(400).json({ error: 'Invalid benchmark request ID' })
    const trace = {
      pending: 0, finished: false, saved: false,
      data: {
        request_id: requestId, method: req.method, path: req.originalUrl,
        timestamp: new Date().toISOString(), queries: [],
      },
    }
    res.setHeader(explainHeader, requestId)
    const finish = () => {
      if (trace.finished) return
      trace.finished = true
      trace.data.status = res.statusCode
      trace.data.aborted = !res.writableFinished
      trace.data.finished_at = new Date().toISOString()
      save(trace)
    }
    res.once('finish', finish)
    res.once('close', finish)
    context.run(trace, next)
  }
}

module.exports = {
  databaseDialectHeader,
  explainDirectory,
  explainHeader,
  installExplain,
  preloadKatex,
}
