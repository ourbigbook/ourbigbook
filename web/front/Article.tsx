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

import { AT_MENTION_CHAR, render_toc_from_entry_list } from 'ourbigbook'
// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'

const Article = ({
  article,
  articlesInSamePage,
  articlesInSamePageForToc,
  comments,
  commentsCount=0,
  commentCountByLoggedInUser=undefined,
  isIssue=false,
  issueArticle=undefined,
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
        ? <CustomLink href={routes.issueNew(article.slug)}><NewArticleIcon /> New discussion</CustomLink>
        : <SignupOrLogin to="create discussions"/>
      }
    </>
  }
  const articlesInSamePageMap = {}
  if (!isIssue) {
    for (const article of articlesInSamePage) {
      articlesInSamePageMap[article.slug] = article
    }
  }
  articlesInSamePageMap[article.slug] = article
  const canEdit = isIssue ? !cant.editIssue(loggedInUser, article) : !cant.editArticle(loggedInUser, article)
  const renderRefCallback = React.useCallback(
    (elem) => {
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
            loggedInUser &&
            // Happens on user index page.
            id === loggedInUser.username
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
          let mySlug
          if (loggedInUser) {
            mySlug = `${loggedInUser.username}/${curArticle.topicId}`
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
                    <a className="by-others btn" href={routes.topic(curArticle.topicId)} title="Articles by others on the same topic">
                      <TopicIcon title={false} /> {curArticle.topicCount}{toplevel ? <> By Others<span className="mobile-hide"> On Same Topic</span></> : ''}
                    </a>
                  }
                  {' '}
                  <a className="issues btn" href={routes.issues(curArticle.slug)} title="Discussions">
                    <IssueIcon title={false} /> {isIndex ? issuesCount : curArticle.issueCount}{toplevel ? ' Discussions' : ''}</a>
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
              {canEdit
                ? <>
                    {' '}
                    <span>
                      {false && <>TODO: convert this a and all other injected links to Link. https://github.com/cirosantilli/ourbigbook/issues/274</> }
                      <a
                        href={isIssue ? routes.issueEdit(issueArticle.slug, curArticle.number) : routes.articleEdit(curArticle.slug)}
                        className="btn edit"
                      >
                        <EditArticleIcon />{toplevel && <> <span className="shortcut">E</span>dit</>}
                      </a>
                    </span>
                    {' '}
                    {!isIssue &&
                      <>
                        <a href={routes.articleNew({ 'parent-title': curArticle.titleSource })} className="btn new" title="Create a new article that is a child of this one">
                          {' '}<NewArticleIcon title={false}/>
                          {/* TODO spacing too large on non toplevel, not sure what's the difference*/ toplevel ? ' ' : ''}
                          <i className="ion-arrow-down-c"/>{toplevel ? ' Create child article' : ''}{' '}
                        </a>
                        {' '}
                        {!isIndex &&
                          <a
                            href={routes.articleNew({ 'parent-title': curArticle.parentTitle, 'previous-sibling': curArticle.titleSource })}
                            className="btn new"
                            title="Create a new article that is the next sibling of this one"
                          >
                            {' '}<NewArticleIcon title={false}/>{toplevel ? ' ' : ''}<i className="ion-arrow-right-c"/>{toplevel ? ' Create sibling article' : ''}{' '}
                          </a>
                        }
                      </>
                    }
                  </>
                : <>
                    {!isIssue &&
                      <>
                        {(curArticle.hasSameTopic || isIndex)
                          ? <>
                              {article.slug !== mySlug &&
                                <>
                                  {' '}
                                  <a href={routes.article(mySlug)} className="btn see" title="See my version of this topic">
                                      {' '}<SeeIcon title={false}/>{toplevel ? ' See My Version' : ''}{' '}
                                  </a>
                                </>
                              }
                            </>
                          : <>
                              {' '}
                              <a href={routes.articleNew({ title: curArticle.titleSource })} className="btn new" title="Create my version of this topic">
                                {' '}<NewArticleIcon title={false}/>{toplevel ? ' Create my own version' : ''}{' '}
                              </a>
                            </>
                        }
                      </>
                    }
                  </>
              }
            </>,
            web
          );
        }
        ourbigbook_runtime(elem);
        // Capture link clicks, use ID on current page if one is present.
        // Only go to another page if the ID is not already present on the page.
        for (const a of elem.getElementsByTagName('a')) {
          a.addEventListener(`click`, e => {
            const target = e.currentTarget
            const href = target.getAttribute('href')
            const url = new URL(href, document.baseURI)
            if (
              // Don't do processing for external links.
              url.origin === new URL(document.baseURI).origin
            ) {
              let idNoprefix
              if (url.hash) {
                idNoprefix = url.hash.slice(1)
              } else {
                // + 1 for the '/' that prefixes every link.
                // https://github.com/cirosantilli/ourbigbook/issues/283
                idNoprefix = href.slice(1)
              }
              const targetElem = document.getElementById(idNoprefix)
              if (
                targetElem &&
                // Don't capture Ctrl + Click, as that means user wants link to open on a separate page.
                // https://stackoverflow.com/questions/16190455/how-to-detect-controlclick-in-javascript-from-an-onclick-div-attribute
                !e.ctrlKey &&
                // h2 self link, we want those to actually go to the separated page.
                target.parentElement.tagName !== 'H2'
              ) {
                e.preventDefault()
                window.location.hash = idNoprefix
              }
            }
          });
        }
      }
    },
    []
  );
  let html = ''
  if (!isIssue) {
     html += article.h1Render
  }
  html += article.render
  if (!isIssue) {
    // A mega hacky version. TODO benchmark: would it significantly improve rendering time?
    //const tocHtml = articlesInSamePage.slice(1).map(a => `<div style="padding-left:${30 * (a.depth - firstArticle.depth)}px;"><a href="../${article.author.username}/${a.topicId}">${a.titleRender}</a></div>`).join('') +
    const entry_list = []
    const levelToHeader = { 0: article }
    for (let i = 0; i < articlesInSamePageForToc.length; i++) {
      const a = articlesInSamePageForToc[i]
      const authorUsername = article.author.username
      const level = a.depth - article.depth
      const href = ` href="/${a.slug}"`
      const content = a.titleRender
      let parent_href, parent_content
      if (level > 1) {
        ;({ href: parent_href, content: parent_content } = levelToHeader[level - 1])
      }
      levelToHeader[level] = { href, content }
      entry_list.push({
        content,
        href,
        level,
        has_child: i < articlesInSamePageForToc.length - 1 && articlesInSamePageForToc[i + 1].depth === a.depth + 1,
        // A quick hack as it will be easier to do it here than to modify the link generation.
        // We'll later fix both at once to remove the user prefix one day. Maybe.
        // https://docs.ourbigbook.com/TODO/remove-scope-from-toc-entry-ids
        id_prefix: AT_MENTION_CHAR + authorUsername + '/',
        parent_href,
        parent_content,
        target_id: a.slug,
      })
    }
    if (entry_list.length) {
      html += render_toc_from_entry_list({ entry_list })
    }
    html += articlesInSamePage.map(a => a.h2Render + a.render).join('')
  }
  return <>
    <div
      dangerouslySetInnerHTML={{
        __html: html
      }}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="comments content-not-ourbigbook">
      {isIssue
        ? <>
            <h2><IssueIcon /> Comments ({ commentsCount })</h2>
            <div className="comment-form-holder">
              <CommentInput {...{
                comments,
                commentCountByLoggedInUser,
                issueNumber: article.number,
                loggedInUser,
                setComments,
              }}/>
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
                    itemType: 'discussion',
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'discussion',
                  }}/>
                  <h3>Top threads</h3>
                  <ArticleList {...{
                    articles: topIssues,
                    articlesCount: issuesCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    itemType: 'discussion',
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'issues',
                  }}/>
                  { seeAllCreateNew }
                </>
              : <p>There are no discussions about this article yet.</p>
            }
          </>
      }
    </div>
  </>
}
export default Article
