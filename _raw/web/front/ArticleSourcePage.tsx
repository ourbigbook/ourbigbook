import React from 'react'

import {
  ArticleIcon,
  MyHead,
  SourceIcon,
  useEEdit
} from 'front'
import { cant } from 'front/cant'
import routes from 'front/routes'

import { ArticleType  } from 'front/types/ArticleType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'

import { modifyEditorInput } from 'ourbigbook';

export interface ArticleSourcePageProps extends CommonPropsType {
  article: ArticleType & IssueType;
}

const ArticleSourcePageHoc = (isIssue=false) => {
  return function ArticleSourcePage ({
    article,
    loggedInUser,
  }: ArticleSourcePageProps) {
    const author = article.author
    const canEdit = isIssue ? !cant.editIssue(loggedInUser, article.author.username) : !cant.editArticle(loggedInUser, article.author.username)
    useEEdit(canEdit, article.slug)
    return <>
      <MyHead title={`Source: /${article.slug}`} />
      <div className="article-source-page content-not-ourbigbook">
        <h1><SourceIcon /> Source: <a href={routes.article(article.slug)}>{article.slug}</a></h1>
        <pre><code>{modifyEditorInput(article.file.titleSource, article.file.bodySource).new}</code></pre>
        <p className="navlink"><a href={routes.article(article.slug)}><ArticleIcon /> Back to article page</a></p>
      </div>
    </>
  }
}

export default ArticleSourcePageHoc;
