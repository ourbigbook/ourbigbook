import React from 'react'
import { useRouter } from 'next/router'

import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import config from 'front/config'
import cant from 'front/cant'
import { formatDate } from 'front/date'
import UserLinkWithImage from 'front/UserLinkWithImage'

const Comment = ({ comment, comments, id, loggedInUser, setComments }) => {
  const router = useRouter();
  const {
    query: { number: issueNumber, slug },
  } = router;
  const handleDelete = async (commentId) => {
    await webApi.commentDelete(slug.join('/'), issueNumber, comment.number)
    setComments(comments => comments.filter(comment => comment.id !== id))
  };
  const targetId = `comment${config.idSep}${comment.number}`
  return (
    <div className="comment" id={targetId}>
      <div className="comment-header">
        <a className="number" href={`#${targetId}`}>#{comment.number}</a>
        {' by '}
        <UserLinkWithImage user={comment.author} showUsernameMobile={false} />
        {' on '}
        {formatDate(comment.createdAt)}
        {' '}
        <Maybe test={!cant.deleteComment(loggedInUser, comment)}>
          <button
            className="btn"
            onClick={() => handleDelete(comment.id)}
          >
            <i className="ion-trash-a" /> Delete Comment
          </button>
        </Maybe>
      </div>
      <div
        className="comment-body ourbigbook"
        dangerouslySetInnerHTML={{ __html: comment.render }}
      />
    </div>
  );
};

export default Comment;
