import React from 'react'
import { useRouter } from 'next/router'

import { formatDate } from 'ourbigbook'

import { CommentIcon, DeleteIcon, SeeIcon, TimeIcon, UnlistedIcon } from 'front'
import { getCommentSlug } from 'front/js'
import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import config from 'front/config'
import CustomLink from 'front/CustomLink'
import { cant } from 'front/cant'
import { ItemBody } from 'front/ItemBody'
import UserLinkWithImage from 'front/UserLinkWithImage'
import routes from 'front/routes'
import ToggleButton from 'front/ToggleButton'

const Comment = ({
  comment,
  loggedInUser,
  setComments=undefined,
  showFullSlug=true,
  showFullBody,
}) => {
  const router = useRouter();
  const [listed, setListed] = React.useState(comment.list)
  React.useEffect(() => {
    setListed(comment.list)
  }, [comment.list])
  const {
    query: { number: issueNumber, slug },
  } = router;
  const commentArticleSlug = comment.issue?.article?.slug || (slug as string[])?.join('/')
  const commentIssueNumber = comment.issue?.number || issueNumber
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
        {listed === false && <span className="pill"><UnlistedIcon /> Unlisted</span>}
        {' '}
        {!cant.editComment(loggedInUser, comment.author.username) &&
          <ToggleButton {...{
            callbackOff: async () => webApi.commentUpdate(
              commentArticleSlug,
              commentIssueNumber,
              comment.number,
              { list: false },
            ),
            callbackOn: async () => webApi.commentUpdate(
              commentArticleSlug,
              commentIssueNumber,
              comment.number,
              { list: true },
            ),
            confirmOff: () => confirm('Are you sure you want to unlist this comment?'),
            contentOff: <><UnlistedIcon /> Unlist</>,
            contentOn: <><SeeIcon /> List</>,
            on: listed === false,
            onSuccess: () => setListed(!listed),
          }} />
        }
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
