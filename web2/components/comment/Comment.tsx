import React from "react";

import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import Maybe from "components/common/Maybe";
import DeleteButton from "components/comment/DeleteButton";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const Comment = ({ comment }) => {
  const loggedInUser = getLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === comment?.author?.username;
  return (
    <div className="card">
      <div className="card-block">
        {comment.body}
      </div>
      <div className="card-footer">
        <CustomLink
          href="profile/[pid]"
          as={`/profile/${comment.author.username}`}
          className="comment-author"
        >
          <img
            src={comment.author.image}
            className="profile-thumb"
            alt="author profile image"
          />
        </CustomLink>
        &nbsp;
        <CustomLink
          href="profile/[pid]"
          as={`/profile/${comment.author.username}`}
          className="comment-author"
        >
          {comment.author.username}
        </CustomLink>
        <span className="date-posted">{new Date(comment.createdAt).toDateString()}</span>
        <Maybe test={canModify}>
          <DeleteButton commentId={comment.id} />
        </Maybe>
      </div>
    </div>
  );
};

export default Comment;
