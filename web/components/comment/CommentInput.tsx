import axios from "axios";
import { useRouter } from "next/router";
import React from "react";
import { trigger } from "swr";

import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const CommentInput = () => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const [content, setContent] = React.useState("");
  const [isLoading, setLoading] = React.useState(false);
  const handleChange = React.useCallback((e) => {
    setContent(e.target.value);
  }, []);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await axios.post(
      `${SERVER_BASE_URL}/articles/${encodeURIComponent(String(pid))}/comments`,
      JSON.stringify({
        comment: {
          body: content,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${encodeURIComponent(loggedInUser?.token)}`,
        },
      }
    );
    setLoading(false);
    setContent("");
    trigger(`${SERVER_BASE_URL}/articles/${pid}/comments`);
  };

  if (!loggedInUser) {
    return (
      <>
        <CustomLink href="/user/login">
          Sign in
        </CustomLink>
        {' '}or{' '}
        <CustomLink href="/user/register">
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
            value={content}
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
