import React from 'react'
import { useRouter } from 'next/router'

import { DeleteIcon, MyHead, SeeIcon, UnlistedIcon } from 'front'
import { webApi } from 'front/api'
import ArticlePageHoc, { ArticlePageProps } from 'front/ArticlePage'
import { cant } from 'front/cant'
import { FileDirectoryHeader } from 'front/DirPage'
import routes from 'front/routes'
import { UserType } from 'front/types/UserType'

export { getServerSidePropsFile as getServerSideProps } from 'back/FilePage'

const ArticlePage = ArticlePageHoc()

function FileDeleteButton({ username, path }: { username: string; path: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState('')
  const pending = React.useRef(false)
  async function handleDelete() {
    if (pending.current || !confirm(`Delete ${username}/${path}? This cannot be undone.`)) return
    pending.current = true
    setDeleting(true)
    setError('')
    try {
      await webApi.uploadDelete(`${username}/${path}`)
      // Deleting the last file may remove its parent directory too. The root always exists.
      await router.push(routes.dir(username))
    } catch (error) {
      setError(error.response?.status === 403 ? 'Only admins can delete files.' : 'Could not delete the file. Please try again.')
    } finally {
      pending.current = false
      setDeleting(false)
    }
  }
  return <span>
    <button type="button" onClick={handleDelete} disabled={deleting}>
      <DeleteIcon /> {deleting ? 'Deleting…' : 'Delete file'}
    </button>
    {error && <p role="alert">{error}</p>}
  </span>
}

interface FileUpload { username: string; path: string; list: boolean }

function FileActions({ upload, loggedInUser }: { upload: FileUpload; loggedInUser?: UserType }) {
  const [listed, setListed] = React.useState(upload.list)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  React.useEffect(() => { setListed(upload.list) }, [upload.list])
  async function toggleList() {
    if (saving || (listed && !confirm('Unlist this file? It will remain accessible by direct URL.'))) return
    setSaving(true)
    setError('')
    try {
      await webApi.uploadUpdate(`${upload.username}/${upload.path}`, { list: !listed })
      setListed(!listed)
    } catch (error) {
      setError('Could not change file visibility. Please try again.')
    } finally {
      setSaving(false)
    }
  }
  return <div className="file-actions content-not-ourbigbook">
    {!listed && <><span className="pill"><UnlistedIcon /> Unlisted</span>{' '}</>}
    {!cant.editUpload(loggedInUser, upload.username) && <>
      <button type="button" className="modal" onClick={toggleList} disabled={saving}>
        {listed ? <><UnlistedIcon /> Unlist</> : <><SeeIcon /> List</>}
      </button>{' '}
    </>}
    {!cant.deleteUpload(loggedInUser) && <FileDeleteButton username={upload.username} path={upload.path} />}
    {error && <p role="alert">{error}</p>}
  </div>
}

export default function FilePage(props: ArticlePageProps & { fileUpload?: FileUpload; filePreview?: { author: UserType; path: string; render: string } }) {
  const { filePreview } = props
  const actions = props.fileUpload && <FileActions key={`${props.fileUpload.username}/${props.fileUpload.path}`} upload={props.fileUpload} loggedInUser={props.loggedInUser} />
  if (!filePreview) return <>{actions}<ArticlePage {...props} /></>
  return <>
    <MyHead title={`${filePreview.author.username}/${filePreview.path}`} />
    <div className="dir-page file-page content-not-ourbigbook">
      <FileDirectoryHeader author={filePreview.author} path={filePreview.path} isFile={true} />
      {actions}
      <div className="file-content ourbigbook" dangerouslySetInnerHTML={{ __html: filePreview.render }} />
    </div>
  </>
}
