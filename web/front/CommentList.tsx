import Link from 'next/link'

import Pagination from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import {
  IssueIcon,
  TimeIcon,
  UserIcon,
  getCommentSlug,
} from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'

import { CommentType } from 'front/types/CommentType'

export type CommentListProps = {
  comments?: CommentType[];
  commentsCount?: number;
  page: number;
  showAuthor: boolean;
}

const CommentList = ({
  comments,
  commentsCount,
  page,
  showAuthor,
}: CommentListProps) => {
  return (
    <>
      { commentsCount === 0
        ? <div className="content-not-ourbigbook article-preview">
            There are currently no matching comments.
          </div>
        : <div className="list-nav-container">
            <div className="list-container">
              <table className="list">
                <thead>
                  <tr>
                    {showAuthor &&
                      <th className="shrink"><UserIcon /> Author</th>
                    }
                    <th className="shrink"><span className="icon">#</span> id</th>
                    <th className="expand"><IssueIcon /> Issue</th>
                    <th className="shrink"><TimeIcon /> Created</th>
                  </tr>
                </thead>
                <tbody>
                  {comments.map(comment => {
                    const issue = comment.issue
                    const article = issue.article
                    const slug = getCommentSlug(comment)
                    return <tr
                      key={slug}>
                      {showAuthor &&
                        <td className="shrink">
                          <UserLinkWithImage showUsername={false} user={article.author} />
                        </td>
                      }
                      <td className="shrink bold">
                        <Link href={routes.issueComment(article.slug, issue.number, comment.number)}>
                          {slug}
                        </Link>
                      </td>
                      <td className="shrink bold">
                        <Link href={routes.issue(article.slug, issue.number)}>
                          <span
                            className="ourbigbook-title"
                            dangerouslySetInnerHTML={{ __html: issue.titleRender }}
                          />
                        </Link>
                      </td>
                      <td className="shrink">{formatDate(comment.createdAt)}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
            <Pagination {...{
              itemsCount: commentsCount,
              itemsPerPage: articleLimit,
              currentPage: page,
              what: 'comments'
            }} />
          </div>
      }
    </>
  )
}

export default CommentList;
