import React from 'react'
import { useRouter } from 'next/router'

import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import { formatDate } from 'front/date'
import UserLinkWithImage from 'front/UserLinkWithImage'

const Comment = ({ comment, comments, id, loggedInUser, setComments }) => {
  // TODO factor permissions out with backend.
  const canModify = loggedInUser && loggedInUser?.admin;
  const router = useRouter();
  const {
    query: { number: issueNumber, slug },
  } = router;
  const handleDelete = async (commentId) => {
    await webApi.commentDelete(slug.join('/'), issueNumber, comment.number)
    setComments(comments => comments.filter(comment => comment.id !== id))
  };
  return (
    <div className="comment">
      <div className="comment-header">
        <UserLinkWithImage user={comment.author} showUsernameMobile={false} />
        {' '}
        {formatDate(comment.createdAt)}
        {' '}
        <Maybe test={canModify}>
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
