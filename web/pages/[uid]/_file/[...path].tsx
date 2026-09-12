import React from 'react'
import { useRouter } from 'next/router'

import { DeleteIcon, MyHead } from 'front'
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
  return <div className="file-actions content-not-ourbigbook">
    <button type="button" onClick={handleDelete} disabled={deleting}>
      <DeleteIcon /> {deleting ? 'Deleting…' : 'Delete file'}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>
}

export default function FilePage(props: ArticlePageProps & { filePreview?: { author: UserType; path: string; render: string } }) {
  const { filePreview } = props
  const deleteButton = !cant.deleteUpload(props.loggedInUser) && <FileDeleteButton
    key={filePreview ? `${filePreview.author.username}/${filePreview.path}` : props.article.slug}
    username={filePreview ? filePreview.author.username : props.article.author.username}
    path={filePreview ? filePreview.path : props.article.slug.split('/').slice(2).join('/')}
  />
  if (!filePreview) return <>{deleteButton}<ArticlePage {...props} /></>
  return <>
    <MyHead title={`${filePreview.author.username}/${filePreview.path}`} />
    <div className="dir-page file-page content-not-ourbigbook">
      <FileDirectoryHeader author={filePreview.author} path={filePreview.path} isFile={true} />
      {deleteButton}
      <div className="file-content ourbigbook" dangerouslySetInnerHTML={{ __html: filePreview.render }} />
    </div>
  </>
}
