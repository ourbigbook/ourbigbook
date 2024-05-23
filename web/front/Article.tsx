import React from 'react'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import ReactDomServer from 'react-dom/server'
import Router from 'next/router'

import { commentsHeaderId } from 'front/config'
import { formatDate } from 'front/date'
import {
  ArrowUpIcon,
  DeleteIcon,
  EditArticleIcon,
  HelpIcon,
  IssueIcon,
  NewArticleIcon,
  SeeIcon,
  SignupOrLogin,
  SourceIcon,
  TimeIcon,
  TopicIcon,
} from 'front'
import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import LikeArticleButton from 'front/LikeArticleButton'
import { CommentType } from 'front/types/CommentType'
import ArticleList from 'front/ArticleList'
import routes from 'front/routes'
import { cant } from 'front/cant'
import CustomLink from 'front/CustomLink'
import FollowArticleButton from 'front/FollowArticleButton'

import {
  ANCESTORS_ID,
  ANCESTORS_MAX,
  AT_MENTION_CHAR,
  INCOMING_LINKS_ID_UNRESERVED,
  INCOMING_LINKS_MARKER,
  Macro,
  HTML_PARENT_MARKER,
  SYNONYM_LINKS_ID_UNRESERVED,
  SYNONYM_LINKS_MARKER,
  TAGGED_ID_UNRESERVED,
  TAGS_MARKER,
  tocId,
  htmlAncestorLinks,
  htmlToplevelChildModifierById,
  renderTocFromEntryList,
} from 'ourbigbook'
// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'

function linkList(articles, idUnreserved, marker, title, linkPref) {
  if (articles.length) return <>
    <h2 id={`${Macro.RESERVED_ID_PREFIX}${idUnreserved}`}><a
      href={`#${Macro.RESERVED_ID_PREFIX}${idUnreserved}`}
      dangerouslySetInnerHTML={{ __html: `${marker} ${title}` }}
      className="ourbigbook-title">
    </a></h2>
    <ul>
      {articles.map(a =>
        <li key={a.slug}><a
          href={`${linkPref}${a.slug}`}
          className="ourbigbook-title"
          dangerouslySetInnerHTML={{ __html: a.titleRender}}
        ></a></li>
      )}
    </ul>
  </>
}

const Article = ({
  ancestors,
  article,
  articlesInSamePage,
  articlesInSamePageForToc,
  comments,
  commentsCount=0,
  commentCountByLoggedInUser=undefined,
  incomingLinks,
  isIssue=false,
  issueArticle=undefined,
  latestIssues,
  loggedInUser,
  synonymLinks,
  tagged,
  topIssues,
}) => {
  const [curComments, setComments] = React.useState(comments)
  let seeAllCreateNew
  if (!isIssue) {
    seeAllCreateNew = <>
      {latestIssues.length > 0 &&
        <>
          <CustomLink href={routes.issues(article.slug)} className="btn small"><SeeIcon /> See All ({ article.issueCount })</CustomLink>
          {' '}
        </>
      }
      {loggedInUser
        ? <CustomLink
            className="btn small"
            href={routes.issueNew(article.slug)}
            updatePreviousPage={true}
          >
            <NewArticleIcon /> New Discussion
          </CustomLink>
        : <SignupOrLogin to="create discussions"/>
      }
    </>
  }
  let linkPref: string|undefined
  if (!isIssue) {
    linkPref = '../'.repeat(article.slug.split('/').length - 1)
  }
  const articlesInSamePageMap = {}
  if (!isIssue) {
    for (const article of articlesInSamePage) {
      articlesInSamePageMap[article.slug] = article
    }
    articlesInSamePageMap[article.slug] = article
  }
  const webElemToRootMap = React.useRef(new Map())
  const canEdit = isIssue ? !cant.editIssue(loggedInUser, article) : !cant.editArticle(loggedInUser, article)
  const canDelete = isIssue ? !cant.deleteIssue(loggedInUser, article) : !cant.deleteArticle(loggedInUser, article)

  const renderRefCallback = React.useCallback(
    (elem) => {
      if (elem) {
        for (const h of elem.querySelectorAll('.h')) {
          const id = h.id
          const webElem = h.querySelector('.web')
          const toplevel = webElem.classList.contains('top')
          // TODO rename to article later on.
          let curArticle, isIndex
          if (isIssue) {
            if (!toplevel) {
              continue
            }
            curArticle = article
          } else if (
            id === article.author.username
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

          // Ancestors.
          {
            const ancestorsElem = h.querySelector('.ancestors')
            if (ancestorsElem) {
              if (ancestors.length) {
                ancestorsElem.innerHTML = htmlAncestorLinks(
                  ancestors.slice(Math.max(ancestors.length - ANCESTORS_MAX, 0)).map(a => { return {
                    href: ` href="${linkPref}${a.slug}"`,
                    content: a.titleRender,
                  }}),
                  ancestors.length,
                )
              } else {
                createRoot(ancestorsElem).render(
                  <span dangerouslySetInnerHTML={{
                    __html: `<span> ${ReactDomServer.renderToString(<HelpIcon />)} Ancestors will show here when the tree index is updated</span>`
                  }} ></span>,
                )
              }
            }
          }

          // We use this map to prevent calling createRoot twice on the same element, which gives a warning.
          // TODO how/when to correctly clear this map? Tried on 
          let root = webElemToRootMap.current.get(webElem)
          if (!root) {
            root = createRoot(webElem)
            webElemToRootMap.current.set(webElem, root)
          }
          root.render(
            <>
              <LikeArticleButton {...{
                article: curArticle,
                issueArticle,
                isIssue,
                loggedInUser,
                showText: toplevel,
              }} />
              {!isIssue &&
                <>
                  {' '}
                  {!isIndex &&
                    <a className="by-others btn" href={routes.topic(curArticle.topicId)} title="Articles by others on the same topic">
                      <TopicIcon title={false} /> {curArticle.topicCount - 1}{toplevel ? <> By Others<span className="mobile-hide"> On Same Topic</span></> : ''}
                    </a>
                  }
                  {' '}
                  <a className="issues btn" href={routes.issues(curArticle.slug)} title="Discussions">
                    <IssueIcon title={false} /> {curArticle.issueCount}{toplevel ? ' Discussions' : ''}</a>
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
                      {false && <>TODO: convert this a and all other injected links to Link. https://github.com/ourbigbook/ourbigbook/issues/274</> }
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
                        <a href={routes.articleNew({ 'parent-title': curArticle.titleSource })} className="btn new" title="Create a new article that is the first child of this one">
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
                    {!(isIssue || isIndex) &&
                      <>
                        {(curArticle.hasSameTopic)
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
              {(false && canDelete) &&
                <>
                  TODO https://docs.ourbigbook.com/todo/delete-articles
                  {' '}
                  <span>
                    <a
                      href={isIssue ? routes.issueDelete(issueArticle.slug, curArticle.number) : routes.articleDelete(curArticle.slug)}
                      className="btn edit"
                    >
                      <DeleteIcon /> Delete
                    </a>
                  </span>
                </>
              }
            </>
          )
        }
        ourbigbook_runtime(elem);

        function myRedirect() {
            const frag = window.location.hash.substring(1);
            const path = window.location.pathname.substring(1);
            if (frag && !document.getElementById(frag)) {
                const ids = [path + '/' + frag, path.split('/').slice(0, -1).join('/') + '/' + frag];
                for (const id of ids) {
                    if (document.getElementById(id)) {
                        window.location.replace('#' + id);
                        const myUrl = '/' + path + '#' + frag;
                        setTimeout(() => window.history.replaceState({...window.history.state, as: myUrl, url: myUrl}, '', myUrl), 0);
                        break;
                    }
                }
            }
        }

        myRedirect();

        window.onhashchange = myRedirect;

        // Change link destinations, use ID on current page if one is present.
        // Only go to another page if the ID is not already present on the page.
        //
        // All HTML href links are full as in /username/scope/articleid
        //
        // If we are e.g. under /username/scope and articleid is present, no need
        // for changing the page at all, just jump inside page.
        for (const a of elem.getElementsByTagName('a')) {
          const href = a.getAttribute('href');
          const url = new URL(href, document.baseURI);
          if (!href) {
            a.href = '#';
          } else if (
            // Don't do processing for external links.
            url.origin === new URL(document.baseURI).origin
          ) {
            let idNoprefix;
            if (url.hash) {
              idNoprefix = url.hash.slice(1)
            } else {
              // + 1 for the '/' that prefixes every link.
              // https://github.com/ourbigbook/ourbigbook/issues/283
              idNoprefix = href.slice(1)
            }
            const targetElem = document.getElementById(idNoprefix);
            if (
              targetElem &&
              // h2 self link, we want those to actually go to the separated page.
              a.parentElement.tagName !== 'H2'
            ) {
              let myLink = '#' + idNoprefix;
              const path = window.location.pathname.substring(1);
              const myPaths = [path + '/', path.split('/').slice(0, -1).join('/') + '/'];
              for (const myPath of myPaths) {
                let newFrag = idNoprefix.replace(myPath, '');
                if (idNoprefix.startsWith(myPath)
                && !newFrag.startsWith(myPaths[0])
                && !newFrag.startsWith(myPaths[1])) {
                  myLink = '#' + newFrag;
                  break;
                }
              }
              a.href = myLink;
            }
          }
        }
      }
    },
    [ancestors, articlesInSamePageMap, webElemToRootMap]
  )
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
      const href = a.slug
      const content = a.titleRender
      let parent_href, parent_content
      if (level > 1) {
        ;({ href: parent_href, content: parent_content } = levelToHeader[level - 1])
      } else {
        parent_content = article.titleRender
      }
      levelToHeader[level] = { href, content }
      entry_list.push({
        content,
        href: ` href="/${href}"`,
        level,
        has_child: i < articlesInSamePageForToc.length - 1 && articlesInSamePageForToc[i + 1].depth === a.depth + 1,
        // A quick hack as it will be easier to do it here than to modify the link generation.
        // We'll later fix both at once to remove the user prefix one day. Maybe.
        // https://docs.ourbigbook.com/TODO/remove-scope-from-toc-entry-ids
        id_prefix: AT_MENTION_CHAR + authorUsername + '/',
        parent_href: ` href="#${parent_href ? tocId(parent_href) : Macro.TOC_ID}"`,
        parent_content,
        target_id: a.slug,
      })
    }
    if (entry_list.length) {
      html += htmlToplevelChildModifierById(renderTocFromEntryList({ entry_list }), Macro.TOC_ID) 
    }
    html += articlesInSamePage.map(a => a.h2Render + a.render).join('')
  }
  return <>
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="meta content-not-ourbigbook">
      {isIssue
        ? <>
            <h2 id={commentsHeaderId}>
              <a href={`#${commentsHeaderId}`}><IssueIcon /> Comments ({ commentsCount })</a>
              {' '}
              <FollowArticleButton {...{
                article,
                issueArticle,
                isIssue: true,
                loggedInUser,
                showText: false,
              }} />
            </h2>
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
            <div className="ourbigbook-title">
              {linkList(tagged, TAGGED_ID_UNRESERVED, TAGS_MARKER, 'Tagged', linkPref)}
              {(ancestors.length !== 0) && <>
                <h2 id={ANCESTORS_ID}><a
                  href={`#${ANCESTORS_ID}`} dangerouslySetInnerHTML={{ __html: HTML_PARENT_MARKER + ' Ancestors' }}
                  className="ourbigbook-title">
                </a></h2>
                <ol>
                  {ancestors.slice().reverse().map(a =>
                    // Don't need href=../a.slug because this section cannot appear on the index page.
                    <li key={a.slug}><a
                      href={`${linkPref}${a.slug}`}
                      dangerouslySetInnerHTML={{ __html: a.titleRender}}
                    ></a></li>
                  )}
                </ol>
              </>}
            {linkList(incomingLinks, INCOMING_LINKS_ID_UNRESERVED, INCOMING_LINKS_MARKER, 'Incoming links', linkPref)}
            {linkList(synonymLinks, SYNONYM_LINKS_ID_UNRESERVED, SYNONYM_LINKS_MARKER, 'Synonyms', linkPref)}
            </div>
            <h2>
              <CustomLink href={routes.issues(article.slug)}>
                <IssueIcon /> Discussion ({ article.issueCount })
              </CustomLink>
              {' '}
              <FollowArticleButton {...{
                article,
                classNames: ['btn', 'small'],
                isIssue: false,
                loggedInUser,
                showText: false,
              }} />
            </h2>
            { seeAllCreateNew }
            { latestIssues.length > 0 ?
                <>
                  <h3><IssueIcon /> <TimeIcon /> Latest discussions</h3>
                  <ArticleList {...{
                    articles: latestIssues,
                    articlesCount: article.issueCount,
                    comments,
                    commentsCount,
                    issueArticle: article,
                    itemType: 'discussion',
                    loggedInUser,
                    page: 0,
                    showAuthor: true,
                    what: 'discussion',
                  }}/>
                  <h3><IssueIcon /> <ArrowUpIcon /> Top discussions</h3>
                  <ArticleList {...{
                    articles: topIssues,
                    articlesCount: article.issueCount,
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
            <div className="source"><a href={routes.articleSource(article.slug)}><SourceIcon /> View article source</a></div>
          </>
      }
    </div>
  </>
}
export default Article
