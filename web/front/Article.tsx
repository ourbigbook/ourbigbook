import React from 'react'
import * as ReactDOM from 'react-dom'

import { formatDate } from 'front/date'
import { IssueIcon, EditArticleIcon, NewArticleIcon, SeeIcon, SignupOrLogin, TimeIcon, TopicIcon } from 'front'
import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import LikeArticleButton from 'front/LikeArticleButton'
import { CommentType } from 'front/types/CommentType'
import ArticleList from 'front/ArticleList'
import routes from 'front/routes'
import { cant } from 'front/cant'
import CustomLink from 'front/CustomLink'

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'

const Article = ({
  article,
  articlesInSamePage,
  comments,
  commentsCount=0,
  isIssue=false,
  issuesCount,
  latestIssues,
  loggedInUser,
  topIssues,
}) => {
  const [curComments, setComments] = React.useState(comments)
  let seeAllCreateNew
  if (!isIssue) {
    seeAllCreateNew = <>
      {latestIssues.length > 0 &&
        <>
          <CustomLink href={routes.issues(article.slug)}><SeeIcon /> See all ({ issuesCount })</CustomLink>{' '}
        </>
      }
      {loggedInUser
        ? <CustomLink href={routes.issueNew(article.slug)}><NewArticleIcon /> New Discussion</CustomLink>
        : <SignupOrLogin to="create discussions"/>
      }
    </>
  }
  const articlesInSamePageMap = {}
  if (!isIssue) {
    for (const article of articlesInSamePage) {
      articlesInSamePageMap[article.topicId] = article
    }
  }
  const canEdit = isIssue ? !cant.editIssue(loggedInUser, article) : !cant.editArticle(loggedInUser, article)
  function renderRefCallback(elem) {
    if (elem) {
      for (const h of elem.querySelectorAll('.h')) {
        const id = h.id
        const web = h.querySelector('.web')
        const toplevel = web.classList.contains('top')
        // TODO rename to article later on.
        let curArticle, isIndex
        if (isIssue) {
          if (!toplevel) {
            continue
          }
          curArticle = article
        } else if (
          // Happens on user index page.
          id === ''
        ) {
          curArticle = article
          isIndex = true
        } else {
          curArticle = articlesInSamePageMap[id]
          if (!curArticle) {
            // Possible for Include headers. Maybe one day we will cover them.
            continue
          }
        }
        ReactDOM.render(
          <>
            <LikeArticleButton {...{
              article: curArticle,
              loggedInUser,
              isIssue: false,
              showText: toplevel,
            }} />
            {!isIssue &&
              <>
                {' '}
                {!isIndex &&
                  <a className="issues" href={routes.topic(id)}><TopicIcon /> {curArticle.topicCount} {toplevel ? ' By Others' : ''}</a>
                }
                {' '}
                <a className="issues" href={routes.issues(`${curArticle.author.username}/${id}`)}><IssueIcon /> {isIndex ? issuesCount : curArticle.issueCount}{toplevel ? ' Discussions' : ''}</a>
              </>
            }
            {toplevel &&
              <>
                {' '}
                <span title="Last updated">
                  <TimeIcon />{' '}
                  <span className="article-dates">
                    {formatDate(article.updatedAt)}
                  </span>
                </span>
              </>
            }
            {false && article.createdAt !== article.updatedAt &&
              <>
                <span className="mobile-hide">
                  {' Updated: '}
                </span>
                <span className="article-dates">
                  {formatDate(article.updatedAt)}
                </span>
              </>
            }
            {canEdit && <>
              {' '}
              <span>
                {false && <>TODO: convert this a and all other injected links to Link. https://github.com/cirosantilli/ourbigbook/issues/274</> }
                <a
                  href={isIssue ? routes.issueEdit(issueArticle.slug, curArticle.number) : routes.articleEdit(curArticle.slug)}
                  className="btn"
                >
                  <EditArticleIcon />{toplevel && <> <span className="shortcut">E</span>dit</>}
                </a>
                {false &&
                  <button
                    className="btn"
                    onClick={handleDelete}
                  >
                    <i className="ion-trash-a" /> Delete
                  </button>
                }
              </span>
            </>}
          </>,
          web
        );
      }
      ourbigbook_runtime(elem);
    }
  }
  return <>
    <div
      dangerouslySetInnerHTML={{ __html: article.render }}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="comments content-not-ourbigbook">
      {isIssue
        ? <>
            <h2><IssueIcon /> Comments ({ commentsCount })</h2>
            <div className="comment-form-holder">
              <CommentInput {...{ comments, setComments, issueNumber: article.number, loggedInUser }}/>
            </div>
            {curComments?.map((comment: CommentType) =>
              <Comment {...{
                comment,
                comments,
                id: comment.id,
                key: comment.id,
                loggedInUser,
                setComments,
              }} />
            )}
          </>
        : <>
            <h2><CustomLink href={routes.issues(article.slug)}><IssueIcon /> Discussion ({ issuesCount })</CustomLink></h2>
            { seeAllCreateNew }
            { latestIssues.length > 0 ?
                <>
                  <h3>Latest threads</h3>
                  <ArticleList {...{
                    articles: latestIssues,
                    articlesCount: issuesCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    itemType: 'issue',
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'issues',
                  }}/>
                  <h3>Top threads</h3>
                  <ArticleList {...{
                    articles: topIssues,
                    articlesCount: issuesCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    itemType: 'issue',
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'issues',
                  }}/>
                  { seeAllCreateNew }
                </>
              : <p>There are no discussion threads about this article yet.</p>
            }
          </>
      }
    </div>
  </>
}
export default Article
