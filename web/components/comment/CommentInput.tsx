import { useRouter } from "next/router";
import React from "react";
import { trigger } from "swr";

import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import { slugFromRouter } from "lib"
import CommentAPI from "lib/api/comment"
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const CommentInput = () => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const slug = slugFromRouter(router)
  const [body, setBody] = React.useState("");
  const [isLoading, setLoading] = React.useState(false);
  const handleChange = e => {
    setBody(e.target.value);
  };
  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    await CommentAPI.create(slug, body, loggedInUser?.token)
    setLoading(false);
    setBody("");
    trigger(CommentAPI.url(slug));
  };
  if (!loggedInUser) {
    return (
      <>
        <CustomLink href={routes.userLogin()}>
          Sign in
        </CustomLink>
        {' '}or{' '}
        <CustomLink href={routes.userNew()}>
          sign up
        </CustomLink>
        {' '}to add comments on this article.
      </>
    );
  }

  return (
    <>
      <ul className="error-messages">{/* TODO. Reference does not handle those errors either right now.
        but the unconditional (and likely buggy) presence of this is visible. */}</ul>
      <form className="card comment-form" onSubmit={handleSubmit}>
        <div className="comment-form-textarea">
          <textarea
            rows={5}
            placeholder="Write a comment..."
            value={body}
            onChange={handleChange}
            disabled={isLoading}
            className="not-monaco"
          />
        </div>
        <div className="comment-form-submit">
          <CustomImage
            className="profile-thumb"
            src={loggedInUser.effectiveImage}
            alt="author profile image"
          />
          {' '}
          <button className="btn" type="submit">
            Post Comment
          </button>
        </div>
      </form>
    </>
  );
};

export default CommentInput;
