import React from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

import lodash from 'lodash'

import Comment from 'front/Comment'
import Pagination from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import {
  DiscussionIcon,
  TimeIcon,
  UserIcon,
} from 'front'
import { getCommentSlug } from 'front/js'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import ShowBody from 'front/ShowBody'

import { encodeGetParams, QUERY_FALSE_VAL, QUERY_TRUE_VAL } from 'ourbigbook/web_api'

import { CommentType } from 'front/types/CommentType'
import { UserType } from 'front/types/UserType'

export type CommentListProps = {
  comments?: CommentType[];
  commentsCount?: number;
  loggedInUser?: UserType;
  page: number;
  showAuthor?: boolean;
  showBody?: boolean;
  showBodyControl?: boolean;
  showControls?: boolean;
  showFullBody?: boolean;
  showFullSlug?: boolean;
}

const CommentList = ({
  comments,
  commentsCount,
  loggedInUser,
  page,
  showAuthor=true,
  showBody=true,
  showBodyControl=true,
  showControls=true,
  showFullBody=false,
  showFullSlug=true,
}: CommentListProps) => {
  const router = useRouter();
  const { pathname, query } = router
  let showBodyInit
  if (query.body === QUERY_TRUE_VAL) {
    showBodyInit = true
  } else if (query.body === QUERY_FALSE_VAL) {
    showBodyInit = false
  } else {
    showBodyInit = showBody
  }
  const [showBodyState, setShowBodyState] = React.useState(showBodyInit)
  const resetShowBodyGetString = encodeGetParams(lodash.omit(query, 'body'))
  React.useEffect(() => {
    // Reset on tab change.
    setShowBodyState(showBodyInit)
  }, [pathname, resetShowBodyGetString, showBodyInit])
  let pagination
  if (showControls) {
    pagination = <Pagination {...{
      itemsCount: commentsCount,
      itemsPerPage: articleLimit,
      currentPage: page,
      what: 'comments'
    }} />
  } else {
    pagination = <></>
  }
  return (
    <div className="comment-list">
      { commentsCount === 0
        ? <div className="article-preview content-not-ourbigbook">
            There are currently no matching comments.
          </div>
        : <div className="list-nav-container">
            {(showControls && showBodyControl) &&
              <div className="content-not-ourbigbook controls">
                {<ShowBody {...{ setShowBodyState, showBody, showBodyState }}/>}
              </div>
            }
            <div className="content-not-ourbigbook">
              <div className={`list-container${showBodyState ? ' show-body' : ''}`}>
                {showBodyState
                  ? <>
                    {comments?.map((comment: CommentType) => <Comment
                      key={showFullSlug ? getCommentSlug(comment) : comment.number}
                      {...{
                        comment,
                        loggedInUser,
                        showFullBody,
                        showFullSlug,
                      }} />
                    )}
                    </>
                  : <table className="list">
                      <thead>
                        <tr>
                          {showAuthor &&
                            <th className="shrink"><UserIcon /> Author</th>
                          }
                          <th className="shrink"><span className="icon">#</span> id</th>
                          {showFullSlug &&
                            <th className="expand"><DiscussionIcon /> Issue</th>
                          }
                          <th className="shrink"><TimeIcon /> Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comments.map(comment => {
                          const issue = comment?.issue
                          const article = issue?.article
                          let slug
                          if (showFullSlug) {
                            slug = getCommentSlug(comment)
                          } else {
                            slug = comment.number
                          }
                          return <tr key={slug}>
                            {showAuthor &&
                              <td className="shrink">
                                <UserLinkWithImage showUsername={false} user={comment.author} />
                              </td>
                            }
                            <td className="shrink bold">
                              {showFullSlug
                                ? <Link href={routes.issueComment(article.slug, issue.number, comment.number)}>
                                    {slug}
                                  </Link>
                                : <>{slug}</>
                              }
                            </td>
                            {showFullSlug &&
                              <td className="shrink bold">
                                <Link href={routes.issue(article.slug, issue.number)}>
                                  <span
                                    className="ourbigbook-title"
                                    dangerouslySetInnerHTML={{ __html: issue.titleRender }}
                                  />
                                </Link>
                              </td>
                            }
                            <td className="shrink">{formatDate(comment.createdAt)}</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                  }
              </div>
            </div>
            {pagination}
          </div>
      }
    </div>
  )
}

export default CommentList;
