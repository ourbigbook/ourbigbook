import React from 'react'

import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import { CommentType } from 'front/types/CommentType'
import ArticleList from 'front/ArticleList'
import routes from 'front/routes'

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'

function renderRefCallback(elem) {
  if (elem) {
    ourbigbook_runtime(elem);
  }
}

const Article = ({
  article,
  comments,
  commentsCount=0,
  isIssue=false,
  issuesCount,
  latestIssues,
  loggedInUser,
  topIssues,
}) => {
  const [curComments, setComments] = React.useState(comments)
  let seeAllCreateNew
  if (!isIssue) {
    seeAllCreateNew = <>
      {latestIssues.length > 0 &&
        <>
          <a href={routes.issuesLatest(article.slug)}><i className="ion-eye" /> See all { issuesCount } threads</a>
          {' '}
        </>
      }
      <a href={routes.issueNew(article.slug)}><i className="ion-edit" /> New thread</a>
    </>
  }
  return <>
    <div
      dangerouslySetInnerHTML={{ __html: article.render }}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="comments content-not-ourbigbook">
      {isIssue
        ? <>
            <h2><i className="ion-ios-chatbubble" /> Comments ({ commentsCount })</h2>
            <div className="comment-form-holder">
              <CommentInput {...{ comments, setComments, issueNumber: article.number, loggedInUser }}/>
            </div>
            {curComments?.map((comment: CommentType) =>
              <Comment {...{
                comment,
                comments,
                id: comment.id,
                key: comment.id,
                loggedInUser,
                setComments,
              }} />
            )}
          </>
        : <>
            <h2><i className="ion-ios-chatbubble" /> Discussion ({ issuesCount })</h2>
            { seeAllCreateNew }
            { latestIssues.length > 0 ?
                <>
                  <h3>Latest threads</h3>
                  <ArticleList {...{
                    articles: latestIssues,
                    articlesCount: issuesCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    isIssue: true,
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'issues',
                  }}/>
                  <h3>Top threads</h3>
                  <ArticleList {...{
                    articles: topIssues,
                    articlesCount: issuesCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    isIssue: true,
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'issues',
                  }}/>
                  { seeAllCreateNew }
                </>
              : <p>There are no discussion threads about this article yet.</p>
            }
          </>
      }
    </div>
  </>
}
export default Article
