import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import Pagination from 'front/Pagination'
import { CancelIcon, ListIcon, OkIcon } from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { formatNumberApprox } from 'ourbigbook'

type BulkJob = { username?: string; id: number; batchIndex?: number | null; batchCount?: number | null; phase: string; status: string; completed: number | null; total: number | null; error: string | null; createdAt: string; runtimeMs: number | null }
type BulkStatus = { jobs: BulkJob[]; jobsCount: number; todoCount: number; doneCount: number; ongoing?: boolean }

const BuildJobTable = ({ jobs, loading, error, done, global }: { jobs: BulkJob[]; loading: boolean; error: string; done: boolean; global: boolean }) => {
  return <table className="list" aria-label="Build jobs">
    <thead><tr>{global && <th>Username</th>}<th>Job</th><th>Job ID</th><th>Phase</th><th>Status</th><th>Progress</th><th>Created (UTC)</th>{done && <th>Runtime</th>}<th>Error</th></tr></thead>
    <tbody>
      {error && <tr><td colSpan={(done ? 8 : 7) + (global ? 1 : 0)} role="alert">{error}</td></tr>}
      {!jobs.length && !error && <tr><td colSpan={(done ? 8 : 7) + (global ? 1 : 0)}>{loading ? 'Loading jobs…' : 'No jobs yet.'}</td></tr>}
      {jobs.map(job => <tr key={`${job.phase}-${job.id}`}>
      {global && <td><CustomLink href={routes.user(job.username)}>{job.username}</CustomLink></td>}
      <td>{job.batchIndex == null || job.batchCount == null ? '—' : `${job.batchIndex + 1}/${job.batchCount}`}</td>
      <td>{job.id}</td>
      <td>{{ extract: 'ID extraction', check: 'Database check', render: 'Rendering', tree: 'Tree rebuild' }[job.phase] || job.phase}</td>
      <td>{job.status}</td>
      <td className="right">{job.total === null ? '—' : `${job.completed} / ${job.total}`}</td>
      <td><time dateTime={job.createdAt}>{job.createdAt ? (global ? job.createdAt : new Date(job.createdAt).toISOString().slice(0, 19).replace('T', ' ')) : '—'}</time></td>
      {done && <td className="right">{job.runtimeMs == null ? '—' : `${(job.runtimeMs / 1000).toFixed(3)} s`}</td>}
      <td>{job.error || ''}</td>
    </tr>)}</tbody>
  </table>
}

export default function BuildJobs({ username, baseUrl, canCancel=false }: { username?: string; baseUrl: string; canCancel?: boolean }) {
  const router = useRouter()
  const jobsView = router.query.jobs === 'done' ? 'done' : 'todo'
  const requestedPage = Number(router.query.page || 1)
  const jobsPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage - 1 : 0
  const jobsPerPage = 20
  const [bulkStatus, setBulkStatus] = React.useState<BulkStatus | null>(null)
  const [bulkError, setBulkError] = React.useState('')
  const [cancelling, setCancelling] = React.useState(false)
  const [cancelMessage, setCancelMessage] = React.useState('')
  const cancelBuild = async () => {
    setCancelling(true)
    setCancelMessage('')
    try {
      const current = await webApi.articlesCurrentBuild({ timeout: 15000 }, username)
      if (current.status !== 200) throw new Error('Could not load the current build.')
      if (!window.confirm('Cancel this build? Completed articles will be kept.')) return
      const result = await webApi.articlesCancelBuild(current.data.build?.token || null, username, { timeout: 15000 })
      if (result.status !== 202) throw new Error('Could not cancel the build. It may have changed; refresh and try again.')
      setCancelMessage(result.data.message)
    } catch (error) {
      setCancelMessage(error.message)
    } finally {
      setCancelling(false)
    }
  }
  React.useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    setBulkStatus(null)
    const poll = async () => {
      try {
        const options = { view: jobsView, limit: jobsPerPage, offset: jobsPage * jobsPerPage }
        const requestOptions = { timeout: 15000 }
        const { data, status } = await (username
          ? webApi.articlesBulkStatus(username, requestOptions, options)
          : webApi.siteJobs(requestOptions, options))
        if (status !== 200) throw new Error('Could not load background upload status')
        if (active) {
          setBulkStatus(data)
          setBulkError('')
        }
      } catch {
        if (active) setBulkError('Could not load background upload status. Retrying…')
      } finally {
        if (active) timer = setTimeout(poll, 3000)
      }
    }
    poll()
    return () => { active = false; clearTimeout(timer) }
  }, [username, jobsView, jobsPage])
  return <div id="background-uploads" className="list-container">
    <div className="tab-list" role="navigation" aria-label="Build job status">
      <CustomLink href={`${baseUrl}?tab=builds`} className={`tab-item${jobsView === 'todo' ? ' active' : ''}`}><ListIcon /> TODO{bulkStatus && <span className="mobile-hide"> ({formatNumberApprox(bulkStatus.todoCount)})</span>}</CustomLink>
      {' '}
      <CustomLink href={`${baseUrl}?tab=builds&jobs=done`} className={`tab-item${jobsView === 'done' ? ' active' : ''}`}><OkIcon /> Done{bulkStatus && <span className="mobile-hide"> ({formatNumberApprox(bulkStatus.doneCount)})</span>}</CustomLink>
    </div>
    <BuildJobTable jobs={bulkStatus?.jobs || []} loading={!bulkStatus} error={bulkError} done={jobsView === 'done'} global={!username} />
    {bulkStatus && <Pagination currentPage={jobsPage} itemsCount={bulkStatus.jobsCount} itemsPerPage={jobsPerPage} what="jobs" wrap={false} />}
    {canCancel && username && bulkStatus?.ongoing && <div className="build-actions">
      <button type="button" className="btn cancel-build" onClick={cancelBuild} disabled={cancelling}><CancelIcon title={null} /> {cancelling ? 'Cancelling…' : 'Cancel build'}</button>
    </div>}
    {cancelMessage && <div role="status">{cancelMessage}</div>}
  </div>
}
