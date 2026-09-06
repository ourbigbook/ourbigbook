import React from 'react'
import Link from 'next/link'

import { encodeUrlPath, formatDate, URL_SEP } from 'ourbigbook'

import {
  DirectoryIcon,
  MyHead,
  uploadPathWithoutUser,
} from 'front'
import UserLinkWithImage from 'front/UserLinkWithImage'

import { CommonPropsType } from 'front/types/CommonPropsType'
import { UploadDirectoryEntryType } from 'front/types/UploadDirectoryType'
import { UploadEntryType, UploadIndexType } from 'front/types/UploadType'
import Pagination from 'front/Pagination'
import { articleLimit } from 'front/config'
import { UserType } from 'front/types/UserType'
import { dir } from 'front/routes'

export interface DirPageProps extends CommonPropsType {
  author: UserType;
  uploadDirectory: UploadDirectoryEntryType;
  childDirectories: UploadDirectoryEntryType[];
  childFiles: UploadEntryType[];
}

export function FileList({ files, filesCount, page }: { files: UploadIndexType[]; filesCount: number; page: number }) {
  return <div className="list-nav-container">
    {files.length === 0 ? <div className="article-preview content-not-ourbigbook">There are no files to show.</div> :
      <div className="list-container content-not-ourbigbook">
        <table className="list file-list">
          <thead><tr><th>Path</th><th>Preview</th><th>Size (bytes)</th><th>Created</th><th>Updated</th></tr></thead>
          <tbody>{files.map(file => <tr key={file.path}>
            <td className="file-path">{file.url ? <a href={file.url}>{file.path}</a> : file.path}</td>
            <td>{file.previewUrl && <a href={file.url}><img src={file.previewUrl} alt={file.path} loading="lazy" /></a>}</td>
            <td className="shrink right">{file.size.toLocaleString('en-US')}</td>
            <td className="shrink"><time dateTime={file.createdAt} title={file.createdAt}>{formatDate(file.createdAt)}</time></td>
            <td className="shrink"><time dateTime={file.updatedAt} title={file.updatedAt}>{formatDate(file.updatedAt)}</time></td>
          </tr>)}</tbody>
        </table>
      </div>}
    <Pagination currentPage={page} itemsCount={filesCount} itemsPerPage={articleLimit} what="files" />
  </div>
}

export function DirectoryEntries({ author, childDirectories, childFiles }: Pick<DirPageProps, 'author' | 'childDirectories' | 'childFiles'>) {
  if (!childDirectories.length && !childFiles.length) return <p>This directory is empty.</p>
  return <ul>
    {childDirectories.map(e => {
      const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
      return <li key={p}>
        <Link href={dir(author.username, uploadPathWithoutUser(e.path))}>{p}/</Link>
      </li>
    })}
    {childFiles.map(e => {
      const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
      return <li key={p}>
        <a href={`/${author.username}/_file/${encodeUrlPath(uploadPathWithoutUser(e.path))}`}>{p}</a>
      </li>
    })}
  </ul>
}

const DirPageHoc = (isIssue=false) => {
  return function DirPage ({
    author,
    childDirectories,
    childFiles,
    uploadDirectory,
  }: DirPageProps) {
    const pathNoUsername = uploadPathWithoutUser(uploadDirectory.path)
    return <>
      <MyHead title={`${author.username}${URL_SEP}${pathNoUsername}${pathNoUsername ? URL_SEP : ''}`} />
      <div className="dir-page content-not-ourbigbook">
        <h1>
          <DirectoryIcon />
          {' '}
          {(() => {
            const ret = []
            const pathSplit = pathNoUsername ? pathNoUsername.split(URL_SEP) : []
            let curp = ''
            let i = 0
            for (const p of [author.username, ...pathSplit]) {
              ret.push(
                <Link href={dir(author.username, curp)} key={i}>{p}</Link>,
                <span className="meta" key={-i-1}>{URL_SEP}</span>
              )
              if (i !== 0) {
                curp += URL_SEP
              }
              curp += pathSplit[i]
              i++
            }
            return ret
          })()}
        </h1>
        <div className="article-info">
          by
          {' '}
          <UserLinkWithImage user={author} showUsername={true} />
        </div>
        <DirectoryEntries {...{ author, childDirectories, childFiles }} />
      </div>
    </>
  }
}

export default DirPageHoc
