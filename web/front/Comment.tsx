import React from 'react'
import { useRouter } from 'next/router'

import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import { formatDate } from 'front/date'
import UserLinkWithImage from 'front/UserLinkWithImage'

const Comment = ({ comment, loggedInUser }) => {
  const canModify =
    loggedInUser && loggedInUser?.username === comment?.author?.username;
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const handleDelete = async (commentId) => {
    await webApi.commentDelete(pid, commentId)
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
      <div className="comment-body">
        {comment.body}
      </div>
    </div>
  );
};

export default Comment;
