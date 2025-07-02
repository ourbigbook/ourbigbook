import React from 'react'
import Link from 'next/link'

import { URL_SEP } from 'ourbigbook'

import {
  DirectoryIcon,
  MyHead,
  uploadPathWithoutUser,
} from 'front'
import UserLinkWithImage from 'front/UserLinkWithImage'

import { CommonPropsType } from 'front/types/CommonPropsType'
import { UploadDirectoryEntryType } from 'front/types/UploadDirectoryType'
import { UploadEntryType } from 'front/types/UploadType'
import { UserType } from 'front/types/UserType'
import { displayAndUsernameText } from 'front/user'
import { dir } from 'front/routes'

export interface DirPageProps extends CommonPropsType {
  author: UserType;
  uploadDirectory: UploadDirectoryEntryType;
  childDirectories: [UploadDirectoryEntryType];
  childFiles: [UploadEntryType];
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
              ret.push(<>
                <Link href={dir(author.username, curp)}>{p}</Link>
                <span className="meta">{URL_SEP}</span>
              </>)
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
        <ul>
          {childDirectories.map(e => {
            const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
            return <li key={p}>
              <Link href={dir(author.username, uploadPathWithoutUser(e.path))}>{p}/</Link>
            </li>
          })}
          {childFiles.map(e => {
            const p = e.path.substring(e.path.lastIndexOf(URL_SEP) + 1)
            return <li key={p}>
              <a href={`/${author.username}/_file/${uploadPathWithoutUser(e.path)}`}>{p}</a>
            </li>
          })}
        </ul>
      </div>
    </>
  }
}

export default DirPageHoc
