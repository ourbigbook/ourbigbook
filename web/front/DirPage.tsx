import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import { encodeUrlPath, formatDate, URL_SEP } from 'ourbigbook'

import {
  DirectoryIcon,
  FileIcon,
  ImageIcon,
  LargestIcon,
  MyHead,
  TimeIcon,
  UserIcon,
  UnlistedIcon,
  uploadPathWithoutUser,
} from 'front'
import UserLinkWithImage from 'front/UserLinkWithImage'

import { CommonPropsType } from 'front/types/CommonPropsType'
import { UploadDirectoryEntryType } from 'front/types/UploadDirectoryType'
import { UploadEntryType, UploadIndexType } from 'front/types/UploadType'
import Pagination from 'front/Pagination'
import { articleLimit } from 'front/config'
import { UserType } from 'front/types/UserType'
import { currentPageHref, dir } from 'front/routes'
import { TRI_ALL, TRI_FALSE } from 'front/js'

export interface DirPageProps extends CommonPropsType {
  list?: boolean;
  hasUnlisted?: boolean;
  author: UserType;
  uploadDirectory: UploadDirectoryEntryType;
  childDirectories: UploadDirectoryEntryType[];
  childFiles: UploadEntryType[];
}

export function UnlistedFilesNotice({ list, hasUnlisted }: { list?: boolean; hasUnlisted?: boolean }) {
  const router = useRouter()
  if (!hasUnlisted) return null
  const href = value => currentPageHref(router, { listed: value, page: undefined })
  return <p className="content-not-ourbigbook">
    <UnlistedIcon />{' '}
    {list === true ? <>
      There are unlisted files, <Link href={href(TRI_ALL)}>also show them</Link> or <Link href={href(TRI_FALSE)}>only show them</Link>.
    </> : <>
      {list === false ? 'Only unlisted files are being shown' : 'Unlisted files are being shown'}, <Link href={href(undefined)}>show only listed files</Link>.
    </>}
  </p>
}

export function FileList({ files, filesCount, page, username, list, hasUnlisted }: { files: UploadIndexType[]; filesCount: number; page: number; username?: string; list?: boolean; hasUnlisted?: boolean }) {
  return <div className="list-nav-container">
    {files.length === 0 ? <div className="article-preview content-not-ourbigbook">There are no files to show.</div> :
      <div className="list-container content-not-ourbigbook">
        <table className="list file-list">
          <thead><tr>
            <th><FileIcon /> Path</th>
            {username === undefined && <th><UserIcon /> Author</th>}
            <th><ImageIcon /> Preview</th>
            <th><LargestIcon title="Size" /> Size (bytes)</th>
            <th><TimeIcon /> Created</th>
            <th><TimeIcon /> Updated</th>
          </tr></thead>
          <tbody>{files.map(file => {
            const path = username && file.path.startsWith(`${username}/`) ? file.path.slice(username.length + 1) : file.path
            return <tr key={file.path}>
              <td className="file-path">{file.url ? <a href={file.url}>{path}</a> : path}{file.list === false && <> <UnlistedIcon /></>}</td>
              {username === undefined && <td className="shrink">{file.author
                ? <UserLinkWithImage user={file.author} showUsername={false} /> : 'Unknown'}</td>}
              <td className="file-preview">{file.previewUrl && <a href={file.previewUrl}><img src={file.previewUrl} alt={path} loading="lazy" /></a>}</td>
              <td className="shrink right">{file.size.toLocaleString('en-US')}</td>
              <td className="shrink"><time dateTime={file.createdAt} title={file.createdAt}>{formatDate(file.createdAt)}</time></td>
              <td className="shrink"><time dateTime={file.updatedAt} title={file.updatedAt}>{formatDate(file.updatedAt)}</time></td>
            </tr>
          })}</tbody>
        </table>
      </div>}
    <Pagination currentPage={page} itemsCount={filesCount} itemsPerPage={articleLimit} what="files" />
    <UnlistedFilesNotice {...{ list, hasUnlisted }} />
  </div>
}

export function DirectoryEntries({ author, childDirectories, childFiles }: Pick<DirPageProps, 'author' | 'childDirectories' | 'childFiles'>) {
  const router = useRouter()
  if (!childDirectories.length && !childFiles.length) return <p>This directory is empty.</p>
  return <ul>
    {childDirectories.map(e => {
      const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
      return <li key={p}>
        <Link href={{ pathname: dir(author.username, uploadPathWithoutUser(e.path)), query: router.query.listed ? { listed: router.query.listed } : {} }}>{p}/</Link>
      </li>
    })}
    {childFiles.map(e => {
      const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
      return <li key={p}>
        <a href={`/${author.username}/-/file/${encodeUrlPath(uploadPathWithoutUser(e.path))}`}>{p}</a>
        {e.list === false && <> <UnlistedIcon /></>}
      </li>
    })}
  </ul>
}

export function FileDirectoryHeader({ author, path, isFile=false }: { author: UserType; path: string; isFile?: boolean }) {
  const parts = path ? path.split(URL_SEP) : []
  const directories = isFile ? parts.slice(0, -1) : parts
  return <>
    <h1>
      {isFile ? <FileIcon /> : <DirectoryIcon />}{' '}
      <Link href={dir(author.username)}>{author.username}</Link>
      <span className="meta">{URL_SEP}</span>
      {directories.map((part, i) => <React.Fragment key={i}>
        <Link href={dir(author.username, directories.slice(0, i + 1).join(URL_SEP))}>{part}</Link>
        <span className="meta">{URL_SEP}</span>
      </React.Fragment>)}
      {isFile && <a href={`/${author.username}/-/raw/${encodeUrlPath(path)}`}>{parts[parts.length - 1]}</a>}
    </h1>
    <div className="article-info">
      by{' '}<UserLinkWithImage user={author} showUsername={true} />
    </div>
  </>
}

const DirPageHoc = (isIssue=false) => {
  return function DirPage ({
    author,
    childDirectories,
    childFiles,
    uploadDirectory,
    list,
    hasUnlisted,
  }: DirPageProps) {
    const pathNoUsername = uploadPathWithoutUser(uploadDirectory.path)
    return <>
      <MyHead title={`${author.username}${URL_SEP}${pathNoUsername}${pathNoUsername ? URL_SEP : ''}`} />
      <div className="dir-page content-not-ourbigbook">
        <FileDirectoryHeader author={author} path={pathNoUsername} />
        <DirectoryEntries {...{ author, childDirectories, childFiles }} />
        <UnlistedFilesNotice {...{ list, hasUnlisted }} />
      </div>
    </>
  }
}

export default DirPageHoc
