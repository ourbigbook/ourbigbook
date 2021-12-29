import React from 'react'
import { useRouter } from 'next/router'
import { trigger } from 'swr'

import Maybe from 'components/Maybe'
import CommentAPI from 'lib/api/comment'
import { formatDate } from 'lib/utils/date'
import getLoggedInUser from 'lib/utils/getLoggedInUser'
import UserLinkWithImage from 'components/UserLinkWithImage'

const Comment = ({ comment }) => {
  const loggedInUser = getLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === comment?.author?.username;
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const handleDelete = async (commentId) => {
    await CommentAPI.delete(pid, commentId, loggedInUser?.token)
    trigger(CommentAPI.url(pid));
  };
  return (
    <div className="comment">
      <div className="comment-header">
        <UserLinkWithImage user={comment.author} />
        {' '}
        commented on {formatDate(comment.createdAt)}
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
