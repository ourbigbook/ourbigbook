import React from 'react'

import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import { CommentType } from 'front/types/CommentType'

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
  loggedInUser,
}) => {
  const markup = { __html: article.render };
  const [curComments, setComments] = React.useState(comments)
  return <>
    <div
      dangerouslySetInnerHTML={markup}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="comments content-not-ourbigbook">
      <h1>Comments</h1>
      <div className="comment-form-holder">
        <CommentInput {...{ comments, setComments, loggedInUser }}/>
      </div>
      {curComments?.map((comment: CommentType) => (
        <Comment {...{
          comment,
          comments,
          id: comment.id,
          key: comment.id,
          loggedInUser,
          setComments,
        }} />
      ))}
    </div>
  </>
}
export default Article
