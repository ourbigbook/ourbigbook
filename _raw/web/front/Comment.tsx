import React from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

import { CommentIcon, DeleteIcon, TimeIcon } from 'front'
import { getCommentSlug } from 'front/js'
import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import config from 'front/config'
import CustomLink from 'front/CustomLink'
import { cant } from 'front/cant'
import { formatDate } from 'front/date'
import { ItemBody } from 'front/ItemBody'
import UserLinkWithImage from 'front/UserLinkWithImage'
import routes from 'front/routes'

const Comment = ({
  comment,
  loggedInUser,
  setComments=undefined,
  showFullSlug=true,
  showFullBody,
}) => {
  const router = useRouter();
  const {
    query: { number: issueNumber, slug },
  } = router;
  const handleDelete = async (commentId) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      await webApi.commentDelete((slug as string[]).join('/'), issueNumber, comment.number)
      setComments(comments => comments.filter(comment => comment.id !== commentId))
    }
  };
  const targetId = `${config.commentIdPrefix}${comment.number}`
  return (
    <div className="item" id={targetId}>
      <div className="item-header content-not-ourbigbook">
        <CustomLink className="number" href={showFullSlug ?
          routes.issueComment(comment.issue.article.slug, comment.issue.number, comment.number) :
          `#${targetId}`}
        >
          {showFullSlug ? getCommentSlug(comment) : `#${comment.number}`}
        </CustomLink>
        {' by '}
        <UserLinkWithImage user={comment.author} showUsernameMobile={false} />
        {' on '}
        <span className="item-date">
          <TimeIcon />
          {' '}
          {formatDate(comment.createdAt)}
        </span>
        {' '}
        <Maybe test={
          setComments &&
          !cant.deleteComment(loggedInUser, comment)
        }>
          <button
            className="btn"
            onClick={() => handleDelete(comment.id)}
          >
            <DeleteIcon title={null} /> Delete comment
          </button>
        </Maybe>
      </div>
      <ItemBody {...{ showFullBody }}>
        <div
          className="ourbigbook"
          dangerouslySetInnerHTML={{ __html: comment.render }}
        />
      </ItemBody>
      {!showFullBody &&
        <div className="item-footer content-not-ourbigbook">
          <CustomLink
            href={routes.issueComment(comment.issue.article.slug, comment.issue.number, comment.number)}
          >
            <CommentIcon /> Read the full discussion
          </CustomLink>
        </div>
      }
    </div>
  );
};

export default Comment;
