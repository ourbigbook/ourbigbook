import React from 'react'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
import ReactDomServer from 'react-dom/server'
import Router, { useRouter } from 'next/router'

import { commentsHeaderId } from 'front/config'
import {
  ArrowUpIcon,
  ArticleCreatedUpdatedPills,
  CreateMyOwnVersionOfThisTopic,
  CommentIcon,
  DeleteIcon,
  EditArticleIcon,
  HelpIcon,
  IssueIcon,
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
} from 'front'
import CommentList from 'front/CommentList'
import CommentInput from 'front/CommentInput'
import LikeArticleButton from 'front/LikeArticleButton'
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
import { encodeGetParams } from 'ourbigbook/web_api'

function linkList(articles, idUnreserved, marker, title, linkPref) {
  if (articles.length) return <>
    <h2 id={`${Macro.RESERVED_ID_PREFIX}${idUnreserved}`}>
      <a
        href={`#${Macro.RESERVED_ID_PREFIX}${idUnreserved}`}
        className="ourbigbook-title"
      >
        <span dangerouslySetInnerHTML={{ __html: `${marker} ${title}` }} />
        {' '}
        <span className="meta">({articles.length})</span>
      </a>
    </h2>
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

/** The name of this element is not very accurate, it should likely be ArticleDescendantsAndMeta or something like that. */
const Article = ({
  ancestors,
  article,
  articlesInSamePage,
  articlesInSamePageForToc,
  comments,
  commentsCount=0,
  commentCountByLoggedInUser=undefined,
  handleShortFragmentSkipOnce,
  incomingLinks,
  isIssue=false,
  issueArticle=undefined,
  latestIssues,
  loggedInUser,
  page=undefined,
  synonymLinks,
  tagged,
  topIssues,
}) => {
  const [curComments, setComments] = React.useState(comments)
  const [curCommentsCount, setCommentsCount] = React.useState(commentsCount)
  const router = useRouter()
  const getParamString = encodeGetParams(router.query)
  React.useEffect(() => {
    // Otherwise comments don't change on page changes.
    setComments(comments)
    setCommentsCount(commentsCount)
  }, [getParamString, comments, commentsCount])
  let seeAllCreateNew
  if (!isIssue) {
    seeAllCreateNew = <>
      {latestIssues.length > 0 &&
        <>
          <CustomLink href={routes.issues(article.slug)} className="btn"><SeeIcon /> See all ({ article.issueCount })</CustomLink>
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
  if (!isIssue) {
    for (const article of articlesInSamePage) {
      articlesInSamePageMap[article.slug] = article
    }
    articlesInSamePageMap[article.slug] = article
  }
  const webElemToRootMap = React.useRef(new Map())
  const canEdit = isIssue ? !cant.editIssue(loggedInUser, article.author.username) : !cant.editArticle(loggedInUser, article.author.username)
  const canDelete = isIssue ? !cant.deleteIssue(loggedInUser, article) : !cant.deleteArticle(loggedInUser, article)
  const aElemToMetaMap = React.useRef(new Map())

  // Input state: browser bar contains a short fragment like algebra in page /username/mathematics#algebra
  // Output state: browser still contains the unchanged short input fragment, #algebra but everything else works as if
  // id="username/algebra" were the actual fragment, i.e.: we are scrolled to it and CSS :target is active on it.
  //
  // The actual IDs on HTML are fully scoped like "username/algebra", but using Js hacks
  // we always manipulate the browse to show and use the shortest fragments possible.
  //
  // The way this is implemented is that we switch to the long fragment that is present in the HTML, and then quickly
  // edit the URL back to the short fragment.
  //
  // Things you have to test:
  // * open new browser tab on http://localhost:3000/barack-obama#mathematics should stay there and highlight
  // * open new browser tab on http://localhost:3000/barack-obama#barack-obama/mathematics should stay on #barck-obama/barack-obama/mathematics (second barack-obama is a edge case test scope)
  //    TODO: not staying at /barack-obama/barack-obama/mathematics. Something is making it scroll back to /barack-obama/mathematics after window.location.replace
  //    and it does not seem to be window.history.replaceState (tested by putting debugger; statements to stop execution) Whatever it is seems to be happening
  //    between location.replace and history.replaceState...
  // * open new browser tab on http://localhost:3000/barack-obama#_toc/mathematics
  // * http://localhost:3000/barack-obama then by typing on URL bar: #mathematics -> #algebra then go back on back button
  // * http://localhost:3000/barack-obama then by typing on URL bar: #barack-obama/mathematics should to to barck-obama/barack-obama/mathematics
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
          // new URL(window.location.href).hash is aslo empty for '#' with empty frag
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
              newUrl = window.location.pathname + '#' + getShortFragFromLong(fragNoHash)
            } else if (handleShortFragmentCurrentFragType === 'abs') {
              newUrl = window.location.pathname + '#' + AT_MENTION_CHAR + fragNoHash
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
  React.useEffect(() => {
    const elem = staticHtmlRef.current
    if (elem) {
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
        // TODO how/when to correctly clear this map?
        // https://cirosantilli.com/_file/nodejs/next/ref-twice/pages/index.js
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
                    <TopicIcon title={false} /> {curArticle.topicCount - 1}{toplevel ? <> By others<span className="mobile-hide"> on same topic</span></> : ''}
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
                <ArticleCreatedUpdatedPills article={article} />
                {article.list === false &&
                  <>
                    {' '}
                    <span className="pill"><UnlistedIcon /> unlisted</span>
                  </>
                }
              </>
            }
            {canEdit &&
              <>
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
                      <i className="ion-arrow-down-c"/>{toplevel ? <> Create child<span className="mobile-hide"> article</span></> : ''}{' '}
                    </a>
                    {' '}
                    {!isIndex &&
                      <a
                        href={routes.articleNew({ 'parent-title': curArticle.parentTitle, 'previous-sibling': curArticle.titleSource })}
                        className="btn new"
                        title="Create a new article that is the next sibling of this one"
                      >
                        {' '}<NewArticleIcon title={false}/>{toplevel ? ' ' : ''}<i className="ion-arrow-right-c"/>{toplevel ? <> Create sibling<span className="mobile-hide"> article</span></> : ''}{' '}
                      </a>
                    }
                  </>
                }
              </>
            }
            {!(isIssue || isIndex) &&
              <>
                {(curArticle.hasSameTopic)
                  ? <>
                      {article.slug !== mySlug &&
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
        )
      }

      // Capture link clicks, use ID on current page if one is present.
      // Only go to another page if the ID is not already present on the page.
      //
      // All HTML href links are full as in /username/scope/articleid
      //
      // If we are e.g. under /username/scope and articleid is present, no need
      // for changing the page at all, just jump inside page.
      if (!isIssue) {
        for (const a of elem.getElementsByTagName('a')) {
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
                // Insane, but someone Will do it.
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
                // h2 self link, we want those to actually go to the separated page.
                a.parentElement.tagName !== 'H2' &&
                // Because otherwise a matching ID of an article in the same topic could confuse us, search only under our known toplevel.
                elem.contains(targetElem)
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
                      Router.push(a.href)
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
      entry_list.push({
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
      ref={staticHtmlRef}
    />
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
                {linkList(tagged, TAGGED_ID_UNRESERVED, TAGS_MARKER, 'Tagged', linkPref)}
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
                {linkList(incomingLinks, INCOMING_LINKS_ID_UNRESERVED, INCOMING_LINKS_MARKER, 'Incoming links', linkPref)}
                {linkList(synonymLinks, SYNONYM_LINKS_ID_UNRESERVED, SYNONYM_LINKS_MARKER, 'Synonyms', linkPref)}
                <div className="navlink"><CustomLink href={routes.articleSource(article.slug)}><SourceIcon /> View article source</CustomLink></div>
              </div>
              <h2>
                <CustomLink href={routes.issues(article.slug)}>
                  <IssueIcon /> Discussion <span className="meta">({ article.issueCount })</span>
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
                    <h3 className="content-not-ourbigbook"><IssueIcon /> <TimeIcon /> Latest discussions</h3>
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
                    <h3 className="content-not-ourbigbook"><IssueIcon /> <ArrowUpIcon /> Top discussions</h3>
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
export default Article
