import React from "react";

import Maybe from "components/common/Maybe";
import DeleteButton from "components/comment/DeleteButton";
import { formatDate } from "lib/utils/date";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import UserLinkWithImage from "components/common/UserLinkWithImage";

const Comment = ({ comment }) => {
  const loggedInUser = getLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === comment?.author?.username;
  return (
    <div className="comment">
      <div className="comment-header">
        <UserLinkWithImage user={comment.author} />
        {' '}
        commented on {formatDate(comment.createdAt)}
        {' '}
        <Maybe test={canModify}>
          <DeleteButton commentId={comment.id} />
        </Maybe>
      </div>
      <div className="comment-body">
        {comment.body}
      </div>
    </div>
  );
};

export default Comment;
