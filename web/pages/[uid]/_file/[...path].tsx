import React from 'react'

import { MyHead } from 'front'
import ArticlePageHoc, { ArticlePageProps } from 'front/ArticlePage'
import { FileDirectoryHeader } from 'front/DirPage'
import { UserType } from 'front/types/UserType'

export { getServerSidePropsFile as getServerSideProps } from 'back/FilePage'

const ArticlePage = ArticlePageHoc()

export default function FilePage(props: ArticlePageProps & { filePreview?: { author: UserType; path: string; render: string } }) {
  if (!props.filePreview) return <ArticlePage {...props} />
  const { filePreview } = props
  return <>
    <MyHead title={`${filePreview.author.username}/${filePreview.path}`} />
    <div className="dir-page file-page content-not-ourbigbook">
      <FileDirectoryHeader author={filePreview.author} path={filePreview.path} isFile={true} />
      <div className="file-content ourbigbook" dangerouslySetInnerHTML={{ __html: filePreview.render }} />
    </div>
  </>
}
