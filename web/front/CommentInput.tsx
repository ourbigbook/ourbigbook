import { useRouter } from 'next/router'
import React from 'react'

import CustomImage from 'front/CustomImage'
import CustomLink from 'front/CustomLink'
import { useCtrlEnterSubmit, slugFromRouter, LOGIN_ACTION, REGISTER_ACTION, decapitalize } from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'

const CommentInput = ({ comments, loggedInUser, issueNumber, setComments }) => {
  const router = useRouter();
  const slug = slugFromRouter(router)
  const [body, setBody] = React.useState("");
  const [isLoading, setLoading] = React.useState(false);
  const submitButton = React.useRef(null);
  function changeBody(body) {
    setBody(body);
    if (submitButton.current) {
      if (body) {
        submitButton.current.classList.remove('disabled');
      } else {
        submitButton.current.classList.add('disabled');
      }
    }
  }
  React.useEffect(() => changeBody(''), [])
  const handleChange = e => {
    e.stopPropagation()
    changeBody(e.target.value)
  };
  const handleSubmit = async e => {
    e.preventDefault();
    if (body) {
      setLoading(true);
      const ret = await webApi.commentCreate(slug, issueNumber, body)
      setComments(comments => [...comments, ret.data.comment])
      setLoading(false);
      changeBody('');
    }
  };
  useCtrlEnterSubmit(handleSubmit)
  if (!loggedInUser) {
    return (
      <>
        <CustomLink href={routes.userLogin()}>
          {LOGIN_ACTION}
        </CustomLink>
        {' '}or{' '}
        <CustomLink href={routes.userNew()}>
          {decapitalize(REGISTER_ACTION)}
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
            // We need this to prevent the E shortcut from firing
            // when we are editing a comment.
            onKeyDown={(e) => {
              if (e.code === 'Enter' && e.ctrlKey) {
                handleSubmit(e)
              }
              e.stopPropagation()
            }}
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
          <button className="btn" type="submit" ref={submitButton}>
            <span className="disable-part">Post Comment</span>
          </button>
        </div>
      </form>
    </>
  );
};

export default CommentInput;
