import { useRouter } from 'next/router'
import React from 'react'

import { SignupOrLogin } from 'front'
import { hasReachedMaxItemCount } from 'front/js';
import CustomImage from 'front/CustomImage'
import CustomLink from 'front/CustomLink'
import { useCtrlEnterSubmit, slugFromRouter, LOGIN_ACTION, REGISTER_ACTION, decapitalize } from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import MapErrors from 'front/MapErrors'

const CommentInput = ({
  commentCountByLoggedInUser,
  comments,
  loggedInUser,
  issueNumber,
  setComments,
}) => {
  const router = useRouter();
  const slug = slugFromRouter(router)
  const [body, setBody] = React.useState("");
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
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
      const {data, status} = await webApi.commentCreate(slug, issueNumber, body)
      if (status === 200) {
        setComments(comments => [...comments, data.comment])
        changeBody('');
        setErrors([]);
      } else {
        if (data.errors) {
          setErrors(data.errors);
        }
      }
      setLoading(false);
    }
  };
  useCtrlEnterSubmit(handleSubmit)
  if (!loggedInUser) {
    return <SignupOrLogin to="comment on this issue"/>
  }
  const maxReached = hasReachedMaxItemCount(loggedInUser, commentCountByLoggedInUser, 'comments')
  if (maxReached) {
    return <>maxReached</>
  }

  return (
    <>
      <MapErrors errors={errors} />
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
