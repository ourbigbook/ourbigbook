import React from 'react'

import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import { CommentType } from 'front/types/CommentType'
import IssueSummary from 'front/IssueSummary'

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
  issues,
  loggedInUser,
}) => {
  const markup = { __html: article.render };
  return <>
    <div
      dangerouslySetInnerHTML={markup}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="issues content-not-ourbigbook">
      <h1>Comments</h1>
      {issues?.map((issue: IssueType) => (
        <IssueSummary{...{
          issue,
          key: issue.id,
          loggedInUser,
        }} />
      ))}
    </div>
  </>
}
export default Article
