import CommentInput from './CommentInput';
import CommentList from './CommentList';
import { Link } from 'react-router-dom';
import React from 'react';

const CommentContainer = props => {
  return (
    <div>
      <h1>Comments</h1>
      {
        props.currentUser
        ? <div>
            <list-errors errors={props.errors}></list-errors>
            <CommentInput slug={props.slug} currentUser={props.currentUser} />
          </div>
        : <p>
            <Link to="/login">Sign in</Link>
            &nbsp;or&nbsp;
            <Link to="/register">sign up</Link>
            &nbsp;to add comments on this article.
          </p>
      }
      <CommentList
        comments={props.comments}
        slug={props.slug}
        currentUser={props.currentUser} />
    </div>
  );
};

export default CommentContainer;
