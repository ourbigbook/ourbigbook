import React from 'react'

import {
  ArticleIcon,
  MyHead,
  SourceIcon,
  useEEdit
} from 'front'
import { cant } from 'front/cant'
import routes from 'front/routes'
import UserLinkWithImage from 'front/UserLinkWithImage'

import { ArticleType  } from 'front/types/ArticleType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { displayAndUsernameText } from 'front/user'

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
      <MyHead title={`${article.titleRenderPlaintext} (source code) - ${displayAndUsernameText(author)}`} />
      <div className="article-source-page content-not-ourbigbook">
        <h1>
          <SourceIcon />
          {' '}
          <a href={routes.article(article.slug)}>
            <span
              className="ourbigbook-title"
              dangerouslySetInnerHTML={{ __html: article.titleRender }}
            />
          </a>
          <span className="meta small"> (source code)</span>
        </h1>
        <div className="article-info">
          {isIssue &&
            <span className="h2-nocolor inline">
              #{article.number}
              {' '}
            </span>
          }
          by
          {' '}
          <UserLinkWithImage user={author} showUsername={true} />
        </div>
        <pre><code>{modifyEditorInput(article.file.titleSource, article.file.bodySource).new}</code></pre>
        <p className="navlink"><a href={routes.article(article.slug)}><ArticleIcon /> Back to article page</a></p>
      </div>
    </>
  }
}

export default ArticleSourcePageHoc;
