import React from 'react'

import { ArticleIcon, AppContext, useEEdit } from 'front'
import { cant } from 'front/cant'
import routes from 'front/routes'
import { ArticleType  } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import { modifyEditorInput } from 'front/js';

export interface ArticleSourcePageProps {
  article: ArticleType & IssueType;
  loggedInUser?: UserType;
}

const ArticleSourcePageHoc = (isIssue=false) => {
  return ({
    article,
    loggedInUser,
  }: ArticleSourcePageProps) => {
    const author = article.author
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() =>
      setTitle(`Source: /${article.slug}`)
    )
    const canEdit = isIssue ? !cant.editIssue(loggedInUser, article) : !cant.editArticle(loggedInUser, article)
    useEEdit(canEdit, article.slug)
    return (
      <div className="article-source-page content-not-ourbigbook">
        <h1>Source: <a href={routes.article(article.slug)}>/{article.slug}</a></h1>
        <pre><code>{modifyEditorInput(article.file.titleSource, article.file.bodySource).new}</code></pre>
        <div className="source"><a href={routes.article(article.slug)}><ArticleIcon /> Back to article page</a></div>
      </div>
    )
  };
}

export default ArticleSourcePageHoc;
