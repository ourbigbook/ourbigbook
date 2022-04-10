import React from 'react'
import { useRouter } from 'next/router'
import { trigger } from 'swr'

import Maybe from 'front/Maybe'
import { CommentApi } from 'front/api'
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
    await CommentApi.delete(pid, commentId)
    trigger(CommentApi.url(pid));
  };
  return (
    <div className="comment">
      <div className="comment-header">
        <UserLinkWithImage user={comment.author} />
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
