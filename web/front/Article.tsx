import React from 'react'
import Link from 'next/link'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import Router, { useRouter } from 'next/router'

import { parse } from 'node-html-parser'

import {
  commentsHeaderId,
  docsUrl,
  log,
  maxArticleAnnounceMessageLength,
  maxArticlesFetch,
  maxArticlesFetchToc,
} from 'front/config'
import {
  ArrowRightIcon,
  ArrowUpIcon,
  ArticleCreatedUpdatedPills,
  ChildrenIcon,
  CreateMyOwnVersionOfThisTopic,
  CommentIcon,
  DeleteIcon,
  EditArticleIcon,
  HelpIcon,
  DiscussionIcon,
  NewArticleIcon,
  SeeIcon,
  SeeMyOwnVersionOfThisTopic,
  SourceIcon,
  TimeIcon,
  TopicIcon,
  UnlistedIcon,
  fragSetTarget,
  getShortFragFromLong,
  getShortFragFromLongForPath,
  shortFragGoTo,
  addParameterToUrlPath,
  removeParameterFromUrlPath,
  AnnounceIcon,
  ArticleIcon,
  OkIcon,
  ErrorIcon,
} from 'front'
import { webApi } from 'front/api'
import CommentList from 'front/CommentList'
import CommentInput from 'front/CommentInput'
import LikeArticleButton from 'front/LikeArticleButton'
import ArticleList from 'front/ArticleList'
import routes from 'front/routes'
import { cant } from 'front/cant'
import CustomLink from 'front/CustomLink'
import FollowArticleButton from 'front/FollowArticleButton'
import { htmlEscapeAttr } from 'ourbigbook'

import {
  ANCESTORS_ID,
  ANCESTORS_MAX,
  AT_MENTION_CHAR,
  INCOMING_LINKS_ID_UNRESERVED,
  INCOMING_LINKS_MARKER,
  H_ANCESTORS_CLASS,
  H_WEB_CLASS,
  Macro,
  HTML_PARENT_MARKER,
  OURBIGBOOK_CSS_CLASS,
  SYNONYM_LINKS_ID_UNRESERVED,
  SYNONYM_LINKS_MARKER,
  TAGGED_ID_UNRESERVED,
  TAGS_MARKER,
  TOC_LINK_ELEM_CLASS_NAME,
  tocId,
  htmlAncestorLinks,
  htmlToplevelChildModifierById,
  renderTocFromEntryList,
} from 'ourbigbook'
// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime, toplevelMouseleave } from 'ourbigbook/dist/ourbigbook_runtime.js'
import { encodeGetParams, QUERY_TRUE_VAL } from 'ourbigbook/web_api'
import { ArticleType } from 'front/types/ArticleType'
import { slugToTopic, uidTopicIdToSlug } from './js'
import { formatDate } from './date'

const ANNOUNCE_QUERY_PARAM = 'announce'
const NEW_QUERY_PARAM = 'new'
const NEW_MODAL_BUTTON_CLASS = 'new-modal'

function LinkListNoTitle({
  articles,
  linkPref,
}: {
  articles: ArticleType[],
  linkPref: string,
}) {
  return <ul>
    {articles.map(a =>
      <li key={a.slug}><a
        href={`${linkPref}${a.slug}`}
        className="ourbigbook-title"
        dangerouslySetInnerHTML={{ __html: a.titleRender}}
      ></a></li>
    )}
  </ul>
}

function AnnounceModal({
  article,
  router,
  setArticle,
  setShowAnnounce,
}) {
  const [message, setMessage] = React.useState('')
  const messageOk = message.length <= maxArticleAnnounceMessageLength
  return <div
    className="modal-page"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        setShowAnnounce(false)
        Router.push(removeParameterFromUrlPath(router.asPath, ANNOUNCE_QUERY_PARAM), undefined, { scroll: false })
      }
    }}
  >
    <div
      className="modal-container"
    >
      <div className="modal-title ourbigbook-title">
        <AnnounceIcon title={null}/>
        {' '}
        Announce article to followers by email
      </div>
      <textarea
        className="not-monaco"
        rows={5}
        placeholder="Add a message (optional)"
        onChange={e => {
          e.stopPropagation()
          setMessage(e.target.value)
        }}
      >
      </textarea>
      <div>
        {message.length} / {maxArticleAnnounceMessageLength}
        {!messageOk && <> <ErrorIcon /></>}
      </div>
      <button
        disabled={!messageOk}
        onClick={async () => {
          const { data, status } = await webApi.articleAnnounce(article.slug, message)
          if (status === 200) {
            setArticle(data.article)
          }
          setShowAnnounce(false)
          Router.push(removeParameterFromUrlPath(router.asPath, ANNOUNCE_QUERY_PARAM), undefined, { scroll: false })
        }}
      >
        <OkIcon /> Send
      </button>
    </div>
  </div>
}

function LinkList(
  articles: ArticleType[],
  idUnreserved: string,
  marker: string,
  title: string,
  linkPref: string,
  opts: any ={},
) {
  let { href } = opts
  if (href === undefined) {
    href = `#${Macro.RESERVED_ID_PREFIX}${idUnreserved}`
  }
  if (articles.length) return <>
    <h2 id={`${Macro.RESERVED_ID_PREFIX}${idUnreserved}`}>
      <a
        href={href}
        className="ourbigbook-title"
      >
        <span dangerouslySetInnerHTML={{ __html: `${marker} ${title}` }} />
        {' '}
        <span className="meta">({ articles.length })</span>
      </a>
    </h2>
    <LinkListNoTitle {...{ articles, linkPref }} />
  </>
}

function WebMeta({
  article,
  canAnnounce,
  canEdit,
  canDelete,
  curArticle,
  hasArticlesInSamePage=false,
  isIndex,
  isIssue,
  issueArticle,
  loggedInUser,
  router,
  toplevel,
}) {
  let mySlug
  if (loggedInUser) {
    mySlug = `${loggedInUser.username}/${curArticle.topicId}`
  }
  return <>
    {(toplevel && hasArticlesInSamePage) &&
      <>
        <a href={'#' + Macro.TOC_ID} className={TOC_LINK_ELEM_CLASS_NAME} />
        {' '}
      </>
    }
    <LikeArticleButton {...{
      article: curArticle,
      issueArticle,
      isIssue,
      loggedInUser,
      showText: toplevel,
    }} />
    {!isIssue && <>
      {' '}
      {!isIndex &&
        <a className="by-others btn" href={routes.topic(curArticle.topicId)} title="Articles by others on the same topic">
          <TopicIcon title={null} /> {curArticle.topicCount - 1}{toplevel ? <> By others<span className="mobile-hide"> on same topic</span></> : ''}
        </a>
      }
      {' '}
      <a className="issues btn" href={routes.articleIssues(curArticle.slug)} title="Discussions">
        <DiscussionIcon title={null} /> {curArticle.issueCount}{toplevel ? ' Discussions' : ''}</a>
    </>}
    {toplevel && <>
      {' '}
      <ArticleCreatedUpdatedPills article={article} />
      {article.list === false &&
        <>
          {' '}
          <span className="pill"><a href={`${docsUrl}/ourbigbook-web-unlisted-articles`}><UnlistedIcon /> Unlisted</a></span>
        </>
      }
    </>}
    {canEdit &&
      <>
        {' '}
        <span>
          {false && <>TODO: convert this a and all other injected links to Link. https://github.com/ourbigbook/ourbigbook/issues/274</> }
          <a
            href={isIssue ? routes.issueEdit(issueArticle.slug, curArticle.number) : routes.articleEdit(curArticle.slug)}
            className="btn edit"
            title="Edit article"
          >
            <EditArticleIcon />{toplevel && <> <span className="shortcut">E</span>dit</>}
          </a>
        </span>
        {' '}
        {(
          !isIssue &&
          // canEdit check above is not enough because admin can edit but
          // cannot add children.
          loggedInUser.username === curArticle.author.username
        ) &&
          <>{toplevel
            ? <>
                <a
                  href={routes.articleNew(curArticle.topicId ? { 'parent': curArticle.topicId } : {})}
                  className="btn new"
                  title="Create a new article that is the first child of this one"
                >
                  <NewArticleIcon title={null}/>
                  {' '}
                  <ChildrenIcon title={null} />
                  {' '}
                  Add<span className="mobile-hide"> article</span> under
                </a>
                {' '}
                {!isIndex && <>
                  <a
                    href={routes.articleNew({
                      'previous-sibling': curArticle.topicId
                    })}
                    className="btn new"
                    title="Create a new article that is the next sibling of this one"
                  >
                    <NewArticleIcon title={null}/>
                    {' '}
                    <ArrowRightIcon title={null} />
                    {' '}
                    Add<span className="mobile-hide"> article</span> after
                  </a>
                  {' '}
                </>}
              </>
            : <a
                className={`btn ${NEW_MODAL_BUTTON_CLASS} wider`}
                href={addParameterToUrlPath(router.asPath, NEW_QUERY_PARAM, slugToTopic(curArticle.slug))}
                onClick={(e) => {
                  e.preventDefault()
                  const a = e.currentTarget
                  // TODO: mouseleave does not fire after the modal opens. And I can't reproduce on pure JS:
                  // https://cirosantilli.com/_file/js/mouseleave-after-click.html
                  // Without this the onhover selflink does not go away after the modal is closed,
                  // unless we hover and leave again.
                  toplevelMouseleave(a.closest(`.${OURBIGBOOK_CSS_CLASS} > *`))
                  Router.push(a.href, undefined, { scroll: false })
                }}
                title="New..."
              >
                <NewArticleIcon title={null}/>
              </a>
          }</>
        }
      </>
    }
    {toplevel && <>
      {' '}
      {canAnnounce
        ? (() => {
          const nextAnnounceAllowedAt = article.author.nextAnnounceAllowedAt
          const maxAnnouncesReached = nextAnnounceAllowedAt && new Date() < new Date(article.author.nextAnnounceAllowedAt)
          return <a
              className={`btn${article.announcedAt || maxAnnouncesReached ? ' disabled' : ''}`}
              href={addParameterToUrlPath(router.asPath, ANNOUNCE_QUERY_PARAM, QUERY_TRUE_VAL)}
              title={
                article.announcedAt
                  ? "You have already announced this article, it can only be done once"
                  : maxAnnouncesReached
                    ? `You have reached the maximum number of article announcements until ${nextAnnounceAllowedAt}`
                    : "Send a link to this article to all your followers by email"
              }
            >
              <AnnounceIcon title={null}/>
              {' '}
              {article.announcedAt
                ? <><span className="mobile-hide">Announced </span>{formatDate(article.announcedAt)}</>
                : <>Announce<span className="mobile-hide"> to followers by email</span></>
              }
            </a>
          })()
        : <>{article.announcedAt &&
            <span className="pill" title="Announced">
              <AnnounceIcon />
              <span className="mobile-hide"> Announced</span>
              {' '}
              {formatDate(article.updatedAt)}
            </span>
          }</>
      }
    </>}
    {!(isIssue || isIndex) &&
      <>
        {(curArticle.hasSameTopic)
          ? <>
              {curArticle.slug !== mySlug &&
                <>
                  {' '}
                  <SeeMyOwnVersionOfThisTopic slug={mySlug} toplevel={toplevel} />
                </>
              }
            </>
          : <>
              {' '}
              <CreateMyOwnVersionOfThisTopic titleSource={curArticle.titleSource} toplevel={toplevel} />
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
}

/** The name of this element is not very accurate, it should likely be ArticleDescendantsAndMeta or something like that. */
export default function Article({
  ancestors,
  article: articleInit,
  articlesInSamePage,
  articlesInSamePageCount,
  articlesInSamePageForToc,
  articlesInSamePageForTocCount,
  comments,
  commentsCount=0,
  commentCountByLoggedInUser=undefined,
  handleShortFragmentSkipOnce,
  incomingLinks,
  isIndex=false,
  isIssue=false,
  issueArticle=undefined,
  latestIssues,
  loggedInUser,
  page=undefined,
  synonymLinks,
  tagged,
  topIssues,
}) {
  let t0
  // Initially putting this under state for the announce to articles modal to show "announced"
  // as soon as you finish announcing. In general we need to use this pattern whenever the data
  // is modified and we want to show an update to user immediately on the same page.
  const [article, setArticle] = React.useState(articleInit)
  const authorUsername = article.author.username
  const [curComments, setComments] = React.useState(comments)
  const [curCommentsCount, setCommentsCount] = React.useState(commentsCount)
  const router = useRouter()
  const queryNew = router.query[NEW_QUERY_PARAM]
  const [showNew, setShowNew] = React.useState(queryNew)
  const queryAnnounce = router.query[ANNOUNCE_QUERY_PARAM]
  const [showAnnounce, setShowAnnounce] = React.useState(queryAnnounce === QUERY_TRUE_VAL)
  const [showNewListener, setShowNewListener] = React.useState(undefined)
  const getParamString = encodeGetParams(router.query)
  React.useEffect(() => {
    setArticle(articleInit)
    // Otherwise comments don't change on page changes.
    setComments(comments)
    setCommentsCount(commentsCount)
  }, [getParamString, articleInit, comments, commentsCount])
  React.useEffect(() => {
    setShowNew(queryNew)
  }, [queryNew])
  // Close modal on ESC keypress
  React.useEffect(() => {
    function listener(e) {
      // ESC
      if (e.keyCode === 27) {
        setShowNew(undefined)
        Router.push(removeParameterFromUrlPath(router.asPath, NEW_QUERY_PARAM), undefined, { scroll: false })
      }
    }
    if (showNew) {
      setShowNewListener(() => listener)
      document.addEventListener('keydown', listener);
      return () => {
        document.removeEventListener('keydown', listener);
      }
    } else {
      document.removeEventListener('keydown', showNewListener);
      setShowNewListener(undefined)
    }
  }, [showNew, router.asPath, showNewListener])
  let seeAllCreateNew
  if (!isIssue) {
    seeAllCreateNew = <>
      {latestIssues.length > 0 &&
        <>
          <CustomLink href={routes.articleIssues(article.slug)} className="btn">
            <SeeIcon /> See all ({ article.issueCount })
          </CustomLink>
          {' '}
        </>
      }
      <CustomLink
        className="btn"
        href={routes.issueNew(article.slug)}
        updatePreviousPage={true}
      >
        <NewArticleIcon /> New discussion
      </CustomLink>
    </>
  }
  let linkPref: string|undefined
  if (!isIssue) {
    linkPref = '../'.repeat(article.slug.split('/').length - 1)
  }
  const articlesInSamePageMap = {}
  const articlesInSamePageMapForToc = {}
  if (!isIssue) {
    for (const article of articlesInSamePage) {
      articlesInSamePageMap[article.slug] = article
    }
    articlesInSamePageMap[article.slug] = article
    for (const article of articlesInSamePageForToc) {
      articlesInSamePageMapForToc[article.slug] = article
    }
    articlesInSamePageMapForToc[article.slug] = article
  }
  const hasArticlesInSamePage = articlesInSamePage !== undefined && !!articlesInSamePage.length
  const canAnnounce = isIssue ? false : !cant.announceArticle(loggedInUser, authorUsername)
  const canEdit = isIssue ? !cant.editIssue(loggedInUser, article.author.username) : !cant.editArticle(loggedInUser, authorUsername)
  const canDelete = isIssue ? !cant.deleteIssue(loggedInUser, article) : !cant.deleteArticle(loggedInUser, article)
  const aElemToMetaMap = React.useRef(new Map())
  const showNewArticle = showNew === undefined ? undefined : articlesInSamePageMapForToc[uidTopicIdToSlug(authorUsername, showNew)]

  // Input state: browser bar contains a short fragment like algebra in page /username/mathematics#algebra
  // Output state: browser still contains the unchanged short input fragment, #algebra but everything else works as if
  // id="username/algebra" were the actual fragment, i.e.: we are scrolled to it and CSS :target is active on it.
  //
  // The actual IDs on HTML are fully scoped like "username/algebra", but using Js hacks
  // we always manipulate the browse to show and use the shortest fragments possible.
  //
  // The way this is implemented is that we momentarily switch to the long fragment that is present in the HTML
  // so that the browser will jump to the element and highlight it (we couldn't find a cleaner alternative)
  // and then quickly edit the URL back to the short fragment.
  //
  // Things you have to test:
  // * open new browser tab on http://localhost:3000/barack-obama#mathematics should stay there and highlight
  // * open new browser tab on http://localhost:3000/barack-obama#barack-obama/mathematics should stay on #barack-obama/barack-obama/mathematics (second barack-obama is a edge case test scope)
  //    TODO: not staying at /barack-obama/barack-obama/mathematics. Something is making it scroll back to /barack-obama/mathematics after window.location.replace
  //    and it does not seem to be window.history.replaceState (tested by putting debugger; statements to stop execution) Whatever it is seems to be happening
  //    between location.replace and history.replaceState...
  // * open new browser tab on http://localhost:3000/barack-obama#_toc/mathematics
  // * http://localhost:3000/barack-obama then by typing on URL bar: #mathematics -> #algebra then go back on back button
  // * http://localhost:3000/barack-obama then by typing on URL bar: #barack-obama/mathematics should to to barack-obama/barack-obama/mathematics
  // * http://localhost:3000/barack-obama -> toc click ->
  //   /barack-obama#mathematics -> header on hover self link ->
  //   /barack-obama#algebra -> header split link ->
  //   /barack-obama/linear-algebra -> sign in
  //   Then back and forward all the way on browser history.
  // * http://localhost:3000/barack-obama#mathematics then ctrl click self link
  // * hover everything with mouse and see if browser shows sensible link target
  //   * right click copy to clipboard links gives the same destination as clicking them
  // * empty fragment '#':
  //   * http://localhost:3000/barack-obama# on new tab
  //   * http://localhost:3000/barack-obama#mathematics then parent
  // * _ancestors
  //   * http://localhost:3000/barack-obama/mathematics#_ancestors
  //   * http://localhost:3000/barack-obama/mathematics and click "Ancestors" header
  //   * http://localhost:3000/barack-obama#_1 highlights the first paragraph. Does not get overridden by _ancestors handling even though it starts with _
  // * subelement in another page: http://localhost:3000/barack-obama/test-child-1 click Equation "Test data long before ID"
  // * other articles in topic on the same page:
  //   * http://localhost:3000/barack-obama/test-data then at the bottom click "Equation 1. My favorite equation."
  //
  //     It should move URL to http://localhost:3000/barack-obama/test-data#@donald-trump/equation-my-favorite-equation hover and highlight.
  //
  //     The @ is added to make sure an absolute path is used and remove otherwise inevitable ambiguity with short frags.
  //   * http://localhost:3000/barack-obama/test-data#@donald-trump/equation-my-favorite-equation should scroll to and highlight the correct header
  //   * http://localhost:3000/barack-obama/mathematics@donald-trump/physics should redirect to http://localhost:3000/donald-trump/physics because that abs id is not in page
  // * click on the + link of ToC to add new articles before/after. Then click on a non _toc then on a _toc/ link.
  // We are not in the intermediate point where the URL is momentarily long.
  React.useEffect(
    () => {
      let handleShortFragmentCurrentFragType = 'short'
      function handleShortFragment(ev=null) {
        if (handleShortFragmentSkipOnce.current) {
          handleShortFragmentSkipOnce.current = false
          return
        }
        let frag
        if (window.location.href.slice(-1) === '#') {
          // window.location.hash is empty for '#' with empty frag
          // new URL(window.location.href).hash is also empty for '#' with empty frag
          frag = '#'
        } else {
          frag = window.location.hash
        }
        // algebra
        const fragNoHash = frag.substring(1)
        // mathematics
        const pathNoSlash = window.location.pathname.substring(1)
        // mathematics/
        const path = pathNoSlash + '/'
        if (frag) {
          if (handleShortFragmentCurrentFragType === 'short') {
            // Either short given ID, or an ID that is not in current page because there are too many articles before it.
            let fullid
            let elem
            if (fragNoHash === '') {
              fullid = pathNoSlash
            } else {
              if (fragNoHash[0] === AT_MENTION_CHAR) {
                fullid = fragNoHash.slice(1)
                elem = document.getElementById(fullid)
                if (elem) {
                  handleShortFragmentCurrentFragType = 'abs'
                }
              } else {
                let prefix
                let fragNoHashNoPrefix
                if (fragNoHash.startsWith(Macro.TOC_PREFIX)) {
                  prefix = Macro.TOC_PREFIX
                  fragNoHashNoPrefix = fragNoHash.replace(prefix, '')
                } else {
                  if (
                    fragNoHash[0] === Macro.RESERVED_ID_PREFIX &&
                    !(
                      // Unnamed IDs like _1, _2, _3
                      fragNoHash.length > 1 &&
                      fragNoHash[1] >= '0' && fragNoHash[1] <= '9'
                    )
                  ) {
                    // For metadata headers like _ancestors
                    return
                  }
                  prefix = ''
                  fragNoHashNoPrefix = fragNoHash
                }
                fullid = prefix + path + fragNoHashNoPrefix
                elem = document.getElementById(fullid)
                if (!elem) {
                  // Toplevel does not have scope. So e.g. we will look for /username/algebra.
                  const pathSplit = path.split('/')
                  if (pathSplit.length > 2) {
                    fullid = prefix + pathSplit.slice(0, -2).join('/') + '/' + fragNoHashNoPrefix
                    elem = document.getElementById(fullid)
                  }
                }
                if (elem) {
                  handleShortFragmentCurrentFragType = 'long'
                }
              }
            }
            if (elem) {
              fragSetTarget(elem)
            }
            if (handleShortFragmentCurrentFragType !== 'short') {
              // We've found the full URL from the short one. Redirect to full URL to
              // jump to the ID and highlight it.. This triggers a onhashchange event
              // which will call this function once again. The next call will then immediately
              // convert long ID to short ID.
              window.location.replace('#' + fullid)
            } else {
              // ID is not on page anymore because too many articles were added before it on the same page,
              // assume toplevel does not have scope for now. TODO get that information from DB and make the
              // correct assumption here instead.
              Router.replace('/' + fullid)
            }
          } else {
            // Long URL and present in page. Let's shorten it without triggering
            // another onhashchange and we are done.
            //
            // Using this internal-looking API works. Not amazing, bu we can't find a better way.
            // replaceState first arg is an arbitrary object, and we just make it into what Next.js uses.
            // https://github.com/vercel/next.js/discussions/18072
            let newUrl
            if (handleShortFragmentCurrentFragType === 'long') {
              newUrl = window.location.pathname + window.location.search + '#' + getShortFragFromLong(fragNoHash)
            } else if (handleShortFragmentCurrentFragType === 'abs') {
              newUrl = window.location.pathname + window.location.search + '#' + AT_MENTION_CHAR + fragNoHash
            }
            window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
            // Makes user/mathematics -> user/mathematics#algebra -> user/linear-algebra -> browser back history button work
            // However makes: user/mathematics -> user/mathematics#algebra -> user/mathematics#linear-algebra -> browser back history button work
            // give "Error: Cancel rendering route"
            //await Router.replace(shortFrag)
            handleShortFragmentCurrentFragType = 'short'
          }
        }
      }
      if (!isIssue) {
        handleShortFragment()
        window.addEventListener('hashchange', handleShortFragment)
        return () => {
          window.removeEventListener('hashchange', handleShortFragment)
        }
      }
    },
    [
      // Otherwise useEffect doesn't fire when switching to another article,
      // and we might not hover to the correct ID.
      article.slug,
      handleShortFragmentSkipOnce,
      isIssue
    ]
  )

  // https://cirosantilli.com/_file/nodejs/next/ref-twice/pages/index.js
  const staticHtmlRef = React.useRef(null)
  const staticHtmlRefMap = React.useRef(new WeakMap())
  React.useEffect(() => {
    const elem = staticHtmlRef.current
    if (elem) {
      // Without this check, the callbacks do get added twice after
      // pressing the + button which opens a modal. This was noticed with
      // console.log on the selflink mouseenter and mouseleave.
      if (!staticHtmlRefMap.current.get(elem)) {
        staticHtmlRefMap.current.set(elem, true)
        ourbigbook_runtime(
          elem,
          {
            hoverSelfLinkCallback: (a) => {
              if (!isIssue) {
                // We are certain that these links are of form #barack-obama/mathematics
                // and that they point to something present in the current page.
                // E.g. barack-obama/mathematics. So the handling can be a bit simplified.
                const frag = new URL(a.href).hash.substring(1)
                const shortFrag = getShortFragFromLong(frag)
                a.href = '#' + shortFrag
                a.addEventListener(
                  'click',
                  (ev) => {
                    if (!ev.ctrlKey) {
                      shortFragGoTo(handleShortFragmentSkipOnce, shortFrag, frag, document.getElementById(frag))
                    }
                  }
                )
              }
            }
          }
        )
      }
    }
  }, [
    isIssue,
    handleShortFragmentSkipOnce,
    getParamString,
  ])
  React.useEffect(() => {
    const elem = staticHtmlRef.current
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

        // WebMeta
        {
          // Minimal example of this "technique".
          // https://cirosantilli.com/_file/nodejs/next/ref-twice/pages/index.js
          // https://stackoverflow.com/questions/78892868/how-to-inject-a-react-component-inside-static-pre-rendered-html-coming-from-the
          const tmp = document.createElement('div')
          tmp.classList.add('tmp')
          const root = createRoot(tmp)
          root.render(<WebMeta {...{
            article,
            canAnnounce,
            canEdit,
            canDelete,
            curArticle,
            hasArticlesInSamePage,
            isIndex,
            isIssue,
            issueArticle,
            loggedInUser,
            router,
            toplevel,
          }}/>)
          webElem.replaceChildren(tmp)
        }
      }

      // Capture link clicks, use ID on current page if one is present.
      // Only go to another page if the ID is not already present on the page.
      //
      // All HTML href links are full as in /username/scope/articleid
      //
      // If we are e.g. under /username/scope and articleid is present, no need
      // for changing the page at all, just jump inside page.
      if (!isIssue) {
        for (const a of elem.querySelectorAll('a')) {
          if (!aElemToMetaMap.current.has(a)) {
            const href = a.href
            aElemToMetaMap.current.set(a, href)
            const url = new URL(href, document.baseURI)
            if (
              // Don't do processing for external links.
              url.origin === new URL(document.baseURI).origin
            ) {
              // E.g. barack-obama/mathematics
              let frag
              if (url.hash) {
                // This could happen with a raw link like \a[#barack-obama/mathematics]...
                // Shorthand, but someone Will do it.
                frag = url.hash.slice(1)
              } else {
                // + 1 for the '/' that prefixes every link.
                // https://github.com/ourbigbook/ourbigbook/issues/283
                frag = url.pathname.slice(1)
              }
              const targetElem = document.getElementById(frag)
              let goToTargetInPage
              // E.g. mathematics
              const shortFrag = getShortFragFromLong(frag)
              if (
                targetElem &&
                // h2 self link, we want those to actually go to the separate page.
                a.parentElement.tagName !== 'H2' &&
                // Because otherwise a matching ID of an article in the same topic could confuse us,
                // search only under our known toplevel.
                elem.contains(targetElem) &&
                !url.search
              ) {
                goToTargetInPage = true
                a.href = '#' + shortFrag
              } else {
                goToTargetInPage = false
                const frag = getShortFragFromLongForPath(url.hash.slice(1), url.pathname.slice(1))
                a.href = url.pathname + url.search + (frag ? ('#' + frag) : '')
              }
              a.addEventListener('click', e => {
                if (
                  // Don't capture Ctrl + Click, as that means user wants link to open on a separate page.
                  // https://stackoverflow.com/questions/16190455/how-to-detect-controlclick-in-javascript-from-an-onclick-div-attribute
                  !e.ctrlKey
                ) {
                  e.preventDefault()
                  if (
                    // This is needed to prevent a blowup when clicking the "parent" link of a direct child of the toplevel page of an issue.
                    // For articles all works fine because each section is rendered separately and thus has a non empty href.
                    // But issues currently work more like static renderings, and use empty ID for the toplevel header. This is even though
                    // the toplevel header does have already have an ID. We should instead of doing this actually make those hrefs correct.
                    // But lazy now.
                    !href
                  ) {
                    window.location.hash = ''
                  } else {
                    if (goToTargetInPage) {
                      shortFragGoTo(handleShortFragmentSkipOnce, shortFrag, frag, targetElem)
                    } else {
                      let opts: { scroll?: boolean } ={}
                      if (a.classList.contains(NEW_MODAL_BUTTON_CLASS)) {
                        opts.scroll = false
                      }
                      Router.push(a.href, undefined, opts)
                    }
                  }
                }
              })
            }
          }
        }
      }
    }
  }, [
    ancestors,
    article,
    articlesInSamePageMap,
    canDelete,
    canEdit,
    handleShortFragmentSkipOnce,
    isIssue,
    issueArticle,
    linkPref,
    loggedInUser,
  ])
  let html = ''
  if (!isIssue) {
    let h1Render = article.h1Render
    const h1RenderElem = parse(h1Render)

    // Inject dynamic stuff into the h1 render.
    {
      if (!isIssue) {
        const ancestorHtmls = []
        for (const ancestor of ancestors) {
          if (ancestor.hasScope) {
            ancestorHtmls.push(renderToString(
              <a
                href={`${linkPref}${ancestor.slug}`}
                dangerouslySetInnerHTML={{ __html: ancestor.titleRender }}
              />
            ))
            ancestorHtmls.push(renderToString(
              <span className="meta"> {Macro.HEADER_SCOPE_SEPARATOR} </span>
            ))
          }
        }
        h1RenderElem.querySelector(`h1`).insertAdjacentHTML('afterbegin', ancestorHtmls.join(''))
      }

      //Ancestors
      const elem = h1RenderElem.querySelector(`.${H_ANCESTORS_CLASS}`)
      if (elem) {
        if (ancestors.length) {
          elem.innerHTML = htmlAncestorLinks(
            ancestors.slice(Math.max(ancestors.length - ANCESTORS_MAX, 0)).map(a => { return {
              content: a.titleRender,
              href: ` href="${linkPref}${htmlEscapeAttr(a.slug)}"`,
            }}),
            ancestors.length,
          )
        } else {
          elem.innerHTML = `<span><span>${renderToString(<HelpIcon />)} Ancestors will show here when the tree index is updated</span></span>`
        }
      }

      // Web-specific meta like likes and discussion.
      h1RenderElem.querySelector(`.${H_WEB_CLASS}`).innerHTML = renderToString(<WebMeta {...{
        article,
        canAnnounce,
        canDelete,
        canEdit,
        curArticle: article,
        hasArticlesInSamePage,
        isIndex,
        isIssue,
        issueArticle,
        loggedInUser,
        router,
        toplevel: true,
      }}/>)
    }

    html += h1RenderElem.outerHTML
  }
  html += article.render
  if (!isIssue) {
    // A mega hacky version. TODO benchmark: would it significantly improve rendering time?
    //const tocHtml = articlesInSamePage.slice(1).map(a => `<div style="padding-left:${30 * (a.depth - firstArticle.depth)}px;"><a href="../${article.author.username}/${a.topicId}">${a.titleRender}</a></div>`).join('') +
    const entry_list = []
    const levelToHeader = { 0: article }
    if (log.perf) {
      t0 = performance.now()
    }
    for (let i = 0; i < articlesInSamePageForToc.length; i++) {
      const a = articlesInSamePageForToc[i]
      let level = a.depth - article.depth
      const href = a.slug
      const content = a.titleRender
      let parent_href, parent_content
      while (level > 1) {
        const levelToHeaderEntry = levelToHeader[level - 1]
        if (
          // Can be undefined either for:
          // - Index
          // - Child of unlisted article at a given level
          levelToHeaderEntry
        ) {
          ;({ href: parent_href, content: parent_content } = levelToHeaderEntry)
          break
        }
        level -= 1
      }
      if (parent_content === undefined) {
        parent_content = article.titleRender
      }
      levelToHeader[level] = { href, content }
      const entry = {
        addLink: (loggedInUser && loggedInUser.username === article.author.username)
          ? ` <a href="${
              htmlEscapeAttr(addParameterToUrlPath(router.asPath, NEW_QUERY_PARAM, slugToTopic(a.slug)))
            }" title="New..." class="btn abs ${NEW_MODAL_BUTTON_CLASS}">` +
            `${renderToString(<NewArticleIcon title={null}/>)}` +
            `</a>`
          : undefined
        ,
        content,
        href: ` href="/${href}"`,
        level,
        has_child: i < articlesInSamePageForToc.length - 1 && articlesInSamePageForToc[i + 1].depth > a.depth,
        // A quick hack as it will be easier to do it here than to modify the link generation.
        // We'll later fix both at once to remove the user prefix one day. Maybe.
        // https://docs.ourbigbook.com/TODO/remove-scope-from-toc-entry-ids
        id_prefix: AT_MENTION_CHAR + authorUsername + '/',
        parent_href: ` href="#${parent_href ? tocId(parent_href) : Macro.TOC_ID}"`,
        parent_content,
        target_id: a.slug,
      }
      entry_list.push(entry)
    }
    if (entry_list.length) {
      html += htmlToplevelChildModifierById(
        renderTocFromEntryList({
          entry_list,
          hasSearch: false
        }),
        Macro.TOC_ID
      )
      if (articlesInSamePageForTocCount > maxArticlesFetchToc) {
        html += renderToString(
          <div className="toc-limited">
            <HelpIcon /> The table of contents was limited to the first {maxArticlesFetchToc} articles out of {articlesInSamePageForTocCount} total.
            {' '}
            <a href={routes.userArticlesChildren(authorUsername, article.topicId)}>
              Click here to view all children of
              {' '}
              <span
                className="ourbigbook-title"
              >
                <span dangerouslySetInnerHTML={{ __html: article.titleRender }} />
              </span>
            </a>.
          </div>
        )
      }
    }
    if (log.perf) {
      console.error(`perf: Article.articlesInSamePageForToc: ${performance.now() - t0} ms`)
    }
    if (log.perf) {
      t0 = performance.now()
    }
    for (const a of articlesInSamePage) {
      const elem = parse(a.h2Render)
      elem.querySelector(`.${H_WEB_CLASS}`).innerHTML = renderToString(<WebMeta {...{
        article,
        canAnnounce: false,
        canDelete,
        canEdit,
        curArticle: a,
        isIndex: false,
        isIssue,
        issueArticle,
        loggedInUser,
        router,
        toplevel: false,
      }}/>)
      html += elem.outerHTML + a.render
      if (a.taggedArticles) {
        html += `<p><a href="${routes.userArticlesTagged(a.author.username, a.topicId)}"><b>${TAGS_MARKER} Tagged</b></a></p>`
        html += '<div className="content-not-ourbigbook">'
        html += renderToString(LinkListNoTitle( {...{ articles: a.taggedArticles, linkPref } }))
        //for (const t of a.taggedArticles) {
        //  html += `<a href="${t.slug}">${t.titleRender}</a>`
        //}
        html += '</div>'
      }
    }
    if (log.perf) {
      console.error(`perf: Article.articlesInSamePage: ${performance.now() - t0} ms`)
    }
  }
  return <>
    {showNewArticle &&
      <div
        className="modal-page"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowNew(undefined)
            Router.push(removeParameterFromUrlPath(router.asPath, NEW_QUERY_PARAM), undefined, { scroll: false })
          }
        }}
      >
        <div
          className="modal-container"
        >
          <div className="modal-title ourbigbook-title">
            <ArticleIcon />
            {' '}
            <span dangerouslySetInnerHTML={{ __html: showNewArticle.titleRender }} />
          </div>
          <a
            href={routes.articleNew({ 'parent': slugToTopic(showNewArticle.slug) })}
            className="btn new"
            title="Create a new article that is the first child of this one"
          >
            <NewArticleIcon title={null}/>
            {' '}
            <ChildrenIcon title={null} />
            {' '}
            Add article under
          </a>
          <a
            href={routes.articleNew({
              'previous-sibling': slugToTopic(showNewArticle.slug),
            })}
            className="btn new"
            title="Create a new article that is the first child of this one"
          >
            <NewArticleIcon title={null}/>
            {' '}
            <ArrowRightIcon title={null} />
            {' '}
            Add<span className="mobile-hide"> article</span> after
          </a>
        </div>
      </div>
    }
    {showAnnounce && <AnnounceModal {...{
      article,
      router,
      setArticle,
      setShowAnnounce,
    }} />}
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="ourbigbook"
      ref={staticHtmlRef}
    />
    {(articlesInSamePageCount > maxArticlesFetch) &&
      <div className="content-not-ourbigbook toc-limited">
        <HelpIcon /> Articles were limited to the first {maxArticlesFetch} out of {articlesInSamePageForTocCount} total.
        {' '}
        <a href={routes.userArticlesChildren(authorUsername, article.topicId)}>
          Click here to view all children of
          {' '}
          <span
            className="ourbigbook-title"
          >
            <span dangerouslySetInnerHTML={{ __html: article.titleRender }} />
          </span>
        </a>.
      </div>
    }
    <div className="meta">
      {isIssue
        ? <>
            <div className="content-not-ourbigbook">
              <h2 id={commentsHeaderId}>
                <a href={`#${commentsHeaderId}`}><CommentIcon /> Comments <span className="meta">({ curCommentsCount })</span></a>
                {' '}
                <FollowArticleButton {...{
                  article,
                  issueArticle,
                  isIssue: true,
                  loggedInUser,
                  showText: false,
                }} />
              </h2>
            </div>
            <div className="list-container show-body">
              <CommentList {...{
                comments: curComments,
                commentsCount: curCommentsCount,
                loggedInUser,
                page,
                showBody: true,
                showFullBody: true,
                showFullSlug: false,
                showBodyControl: false,
              }}/>
            </div>
            <div className="content-not-ourbigbook">
              <div className="comment-form-holder">
                <CommentInput {...{
                  commentCountByLoggedInUser,
                  issueNumber: article.number,
                  loggedInUser,
                  setComments,
                  setCommentsCount,
                }}/>
              </div>
            </div>
          </>
        : <>
            <div className="content-not-ourbigbook">
              <div className="ourbigbook-title">
                {LinkList(
                  tagged,
                  TAGGED_ID_UNRESERVED,
                  TAGS_MARKER,
                  'Tagged',
                  linkPref,
                  { href: routes.userArticlesTagged(article.author.username, article.topicId) }
                )}
                {(ancestors.length !== 0) && <>
                  <h2 id={ANCESTORS_ID}>
                    <a
                      href={`#${ANCESTORS_ID}`}
                      className="ourbigbook-title"
                    >
                      <span dangerouslySetInnerHTML={{ __html: HTML_PARENT_MARKER + ' Ancestors' }} />
                      {' '}
                      <span className="meta">({ancestors.length})</span>
                    </a>
                  </h2>
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
                {LinkList(
                  incomingLinks,
                  INCOMING_LINKS_ID_UNRESERVED,
                  INCOMING_LINKS_MARKER,
                  'Incoming links',
                  linkPref,
                  { href: routes.userArticlesIncoming(article.author.username, article.topicId) },
                )}
                {LinkList(synonymLinks, SYNONYM_LINKS_ID_UNRESERVED, SYNONYM_LINKS_MARKER, 'Synonyms', linkPref)}
                <p className="navlink"><CustomLink href={routes.articleSource(article.slug)}><SourceIcon /> View article source</CustomLink></p>
              </div>
              <h2>
                <CustomLink href={routes.articleIssues(article.slug)}>
                  <DiscussionIcon /> Discussion <span className="meta">({ article.issueCount })</span>
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
            </div>
            <div>
              { latestIssues.length > 0 ?
                  <>
                    <h3 className="content-not-ourbigbook"><DiscussionIcon /> <TimeIcon /> Latest discussions</h3>
                    <ArticleList {...{
                      articles: latestIssues,
                      articlesCount: article.issueCount,
                      issueArticle: article,
                      itemType: 'discussion',
                      loggedInUser,
                      page: 0,
                      showAuthor: true,
                      showControls: false,
                      what: 'discussion',
                    }}/>
                    <h3 className="content-not-ourbigbook"><DiscussionIcon /> <ArrowUpIcon /> Top discussions</h3>
                    <ArticleList {...{
                      articles: topIssues,
                      articlesCount: article.issueCount,
                      issueArticle: article,
                      itemType: 'discussion',
                      loggedInUser,
                      page: 0,
                      showAuthor: true,
                      showControls: false,
                      what: 'discussions',
                    }}/>
                    {seeAllCreateNew &&
                      <div className="content-not-ourbigbook">
                        { seeAllCreateNew }
                      </div>
                    }
                  </>
                : <p className="content-not-ourbigbook">There are no discussions about this article yet.</p>
              }
            </div>
          </>
      }
    </div>
  </>
}
