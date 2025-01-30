import Head from 'next/head'
import Link from 'next/link'
import Router from 'next/router'
import Script from 'next/script'
import React from 'react'
import { mutate } from 'swr'

import ourbigbook, {
  Macro,
  INCOMING_LINKS_MARKER,
  TAGS_MARKER,
} from 'ourbigbook'

import { webApi } from 'front/api'
import {
  docsUrl,
  sureLeaveMessage,
  useCaptcha
} from 'front/config'
import { AUTH_COOKIE_NAME } from 'front/js'
import CustomLink from 'front/CustomLink'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { UserLinkWithImageInner } from 'front/UserLinkWithImage'

export const AUTH_LOCAL_STORAGE_NAME = 'user'
export const LOGIN_ACTION = 'Sign in'
export const REGISTER_ACTION = 'Sign up'

export function AlphabeticalOrderTabTitle() {
  return <>A-Z</>
}

/** https://stackoverflow.com/questions/2901102/how-to-format-a-number-with-commas-as-thousands-separators */
export function addCommasToInteger(i: number): string {
  return i.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1)
}

export function CreateMyOwnVersionOfThisTopic({ titleSource, toplevel } : { titleSource: string, toplevel: boolean}) {
  return <Link href={routes.articleNew({ title: titleSource })} className="btn new" title="Create my own version of this topic">
    {' '}<NewArticleIcon title={null}/>{toplevel ? ' Create my own version' : ''}{' '}
  </Link>
}

export function SeeMyOwnVersionOfThisTopic({ slug, toplevel } : { slug: string, toplevel: boolean}) {
  return <Link href={routes.article(slug)} className="btn see" title="See my version of this topic">
    {' '}<SeeIcon title={null}/>{toplevel ? ' See my version' : ''}{' '}
  </Link>
}

export function decapitalize(s) {
  return s[0].toLowerCase() + s.slice(1)
}

export function ArticleBy(
  {
    article,
    newTab=false,
    showArticleIcon=false,
    showAuthor=true,
    showTopicId=false,
  }: {
    article?: ArticleType,
    newTab?: boolean,
    showArticleIcon?: boolean,
    showAuthor?: boolean,
    showTopicId?: boolean,
  }
) {
  const isIndex = article.topicId === ''
  const quote = (!isIndex && showAuthor) ? '"' : ''
  const inner = <>
    {showArticleIcon && <><ArticleIcon /> </>}
    {quote}<span
      className="ourbigbook-title"
      dangerouslySetInnerHTML={{ __html: article.titleRender }}
    />{quote}{showAuthor && <>
      {' '}by <UserLinkWithImageInner {...{
        user: article.author,
        showUsername: true,
      }} />
    </>}
    {showTopicId && <> <span className="meta">({article.topicId})</span></>}
  </>
  const href = routes.article(article.slug)
  if (newTab) {
    return <a href={href} target="_blank">{inner} <LinkOpensInNewTabIcon /></a>
  } else {
    return <CustomLink href={href}>{inner}</CustomLink>
  }
}

export function IssueBy(
  { article }:
  { article?: ArticleType }
) {
  return <CustomLink href={routes.article(article.slug)}>
    "<span
      className="ourbigbook-title"
      dangerouslySetInnerHTML={{ __html: article.titleRender }}
    />" by { article.author.displayName }
  </CustomLink>
}

export function DiscussionAbout(
  { article, children, span }:
  { article?: ArticleType; children?: React.ReactNode, span?: boolean }
) {
  const inner = <>
      <DiscussionIcon />{' '}
      Discussion on{' '}
      <ArticleBy {...{article}} />
      {children}
    </>
  let inner2
  if (span) {
    inner2 = <span className="h2">{ inner }</span>
  } else {
    inner2 = <h1 className="h2">{ inner }</h1>
  }
  return <div className="discussion-about">{inner2}</div>
}

// Icons.

export function Icon(cls, title, opts) {
  const showTitle = opts.title === undefined ? true : opts.title
  const extraClasses = opts.extraClasses === undefined ? [] : opts.extraClasses
  return <i className={extraClasses.concat([cls, 'icon']).join(' ')} title={showTitle ? title : undefined } />
}


type FontAwesomeIconOptsType = {
  title?: string|null
}

// Icon IDs can be found by searching under: https://fontawesome.com/search
export function FontAwesomeIcon(
  code,
  opts: {
    cls?: string,
    clsExtra?: string[],
    title?: string,
    opts?: FontAwesomeIconOptsType,
  } ={}
) {
  let { cls, clsExtra, opts: _opts, title } = opts
  const classes = ['icon']
  if (cls === undefined) {
    cls = 'fa-solid-900'
  }
  if (_opts === undefined) {
    _opts = {}
  }
  let _title = _opts.title
  if (_title === null) {
    title = undefined
  } else if (_title !== undefined) {
    title = _title
  }
  classes.push(cls)
  if (clsExtra === undefined) {
    clsExtra = []
  }
  classes.push(...clsExtra)
  return <span
    title={title}
    className={classes.join(' ')}
   >
    {String.fromCharCode(code)}
  </span>
}

export function AnnounceIcon(opts) {
  return FontAwesomeIcon(0xf0a1, { opts, title: "Announce" })
}

export function ArticleIcon(opts) {
  return FontAwesomeIcon(0xf518, { opts, title: "Article" })
}

export function ArrowLeftIcon(opts) {
  return FontAwesomeIcon(0xf060, { opts })
}

export function ArrowRightIcon(opts) {
  return FontAwesomeIcon(0xf061, { opts })
}

export function ArrowUpIcon(opts) {
  return FontAwesomeIcon(0xf062, { opts })
}

export function CancelIcon(opts) {
  return FontAwesomeIcon(0xf00d, { clsExtra: ['icon-cancel'], opts, title: "Cancel" })
}

export function ChildrenIcon(opts) {
  return FontAwesomeIcon(0xf063, { opts, title: "Children" })
}

export function CommentIcon(opts) {
  return FontAwesomeIcon(0xf086, { opts, title: "Comments" })
}

export function DeleteIcon(opts) {
  return FontAwesomeIcon(0xf2ed, { clsExtra: ['icon-delete'], opts, title: "Delete" })
}
export function EditArticleIcon(opts) {
  return FontAwesomeIcon(0xf044, { opts, title: "Edit" })
}

export function ErrorIcon(opts) {
  return FontAwesomeIcon(0xf00d, { clsExtra: ['icon-error'], opts, title: "Error" })
}

export function LinkOpensInNewTabIcon(opts) {
  return FontAwesomeIcon(0xf08e, { opts, title: "Link opens in a new tab" })
}

export function FollowIcon(opts) {
  // https://fontawesome.com/icons/eye?f=classic&s=regular
  return FontAwesomeIcon(0xf06e, { opts, title: "Follow" })
}

export function HelpIcon(opts) {
  return FontAwesomeIcon(0xf05a, { opts, title: "Help" })
}

export function IdIcon(opts) {
  return FontAwesomeIcon(0xf2c1, { opts, title: "Discussion" })
}

export function IncomingIcon() {
  return <span dangerouslySetInnerHTML={{ __html: INCOMING_LINKS_MARKER }} />
}

export function DiscussionIcon(opts) {
  return FontAwesomeIcon(0xf075, { opts, title: "Discussion" })
}

export function LikeIcon(opts) {
  return FontAwesomeIcon(0xf004, { clsExtra: ['icon-heart'], opts, title: "Like" })
}

export function LogoutIcon(opts) {
  return FontAwesomeIcon(0xf2f5, { opts, title: "Logout" })
}

export function MoreIcon(opts) {
  return FontAwesomeIcon(0xf05a, { opts, title: "More" })
}

let logging = false
export function NewArticleIcon(opts) {
  logging = true
  const ret = FontAwesomeIcon(0x2b, { opts, title: "New" })
  logging = false
  return ret
}

export function OkIcon(opts) {
  return FontAwesomeIcon(0xf00c, { clsExtra: ['icon-ok'], opts, title: "Submit" })
  
}

export function PinnedArticleIcon(opts) {
  return FontAwesomeIcon(0xf08d, { opts, title: "Pin" })
  
}

export function SeeIcon(opts) {
  // https://fontawesome.com/icons/eye?f=classic&s=regular
  return FontAwesomeIcon(0xf06e, { opts, title: "View" })
}

export function SettingsIcon(opts) {
  return FontAwesomeIcon(0xf013, { opts, title: "Settings" })
}

export function SourceIcon(opts) {
  return FontAwesomeIcon(0xf15c, { opts, title: "Source" })
}

export function StarIcon(opts) {
  return FontAwesomeIcon(0xf005, { clsExtra: ['icon-star'], opts, title: "Admin" })
}

export function TagIcon() {
  return <span dangerouslySetInnerHTML={{ __html: TAGS_MARKER }} />
}

export function TimeIcon(opts) {
  return FontAwesomeIcon(0xf017, { cls: 'fa-regular-400'})
}

export function TopicIcon(opts) {
  return FontAwesomeIcon(0xf500, { opts, title: "Topic" })
}

export function UserIcon(opts) {
  return FontAwesomeIcon(0xf007, { opts, title: "User" })
}

export function UnfollowIcon(opts) {
  return FontAwesomeIcon(0xf070, { opts, title: "Unfollow" })
}

export function UnlistedIcon(opts) {
  return FontAwesomeIcon(0xf070, { opts, title: "Unlisted" })
}

export function SignupOrLogin(
  { to }:
  { to: string }
) {
  return <>
    <UserIcon />{' '}
    <CustomLink href={routes.userNew()}>
      {REGISTER_ACTION}
    </CustomLink>
    {' '}or{' '}
    <CustomLink href={routes.userLogin()}>
      {decapitalize(LOGIN_ACTION)}
    </CustomLink>
    {' '}to {to}.
  </>
}

export function TopicsHelp({ className=undefined }) {
  return <span className={className ? className : ''}>
    <HelpIcon /> New to <b>topics</b>?
    {' '}
    <a href={`${docsUrl}/ourbigbook-web-topics`}>Read the docs here!</a>
  </span>
}

export function disableButton(btn, msg='Cannot submit due to errors') {
  btn.setAttribute('disabled', '')
  btn.setAttribute('title', msg)
}

export function enableButton(btn) {
  btn.removeAttribute('disabled')
  btn.removeAttribute('title')
}

/// Logout the current user on web UI.
export function logout() {
  window.localStorage.removeItem(AUTH_LOCAL_STORAGE_NAME);
  deleteCookie(AUTH_COOKIE_NAME)
  mutate('user', null);
}

export function slugFromArray(arr, { username }: { username?: boolean } = {}) {
  if (username === undefined) {
    username = true
  }
  const start = username ? 0 : 1
  return arr.slice(start).join(ourbigbook.Macro.HEADER_SCOPE_SEPARATOR)
}

export function slugFromRouter(router, opts={}) {
  let arr = router.query.slug
  if (!arr) {
    return router.query.uid
  }
  return slugFromArray(arr, opts)
}

export const AppContext = React.createContext<{
  prevPageNoSignup: string
  updatePrevPageNoSignup: (newCur: string) => void | undefined,
}>({
  prevPageNoSignup: '',
  updatePrevPageNoSignup: undefined
});

// Global state.
export const AppContextProvider = ({ children, vals }) => {
  return <AppContext.Provider value={vals} >
    {children}
  </AppContext.Provider>
};

export function useCtrlEnterSubmit(handleSubmit) {
  React.useEffect(() => {
    function ctrlEnterListener(e) {
      if (e.code === 'Enter' && e.ctrlKey) {
        handleSubmit(e)
      }
    }
    document.addEventListener('keydown', ctrlEnterListener);
    return () => {
      document.removeEventListener('keydown', ctrlEnterListener);
    };
  }, [handleSubmit]);
}

export function useEEdit(
  canEdit: boolean,
  slug: string,
) {
  React.useEffect(() => {
    function listener(e) {
      if (
        e.code === 'KeyE' &&
        document.activeElement === document.body
      ) {
        if (canEdit) {
          Router.push(routes.articleEdit(slug))
        }
      }
    }
    if (slug !== undefined) {
      document.addEventListener('keydown', listener);
      return () => {
        document.removeEventListener('keydown', listener);
      }
    }
  }, [canEdit, slug]);
}

export function useEEditIssue(
  canEdit: boolean,
  slug: string,
  number: number,
) {
  React.useEffect(() => {
    function listener(e) {
      if (
        e.code === 'KeyE' &&
        document.activeElement === document.body
      ) {
        if (canEdit) {
          Router.push(routes.issueEdit(slug, number))
        }
      }
    }
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    }
  }, [canEdit, slug, number]);
}

/** Add a window event listener but only for the current page.
 * Remove the event when next.js router moves away. */
export function useWindowEventListener(event, callback) {
  React.useEffect(() => {
    window.addEventListener(event, callback)
    // Cleanup listener after leaving the page.
    return () => {
      window.removeEventListener(event, callback)
    }
  }, [callback, event])
}

/** Ask if user really wants to save page that may have unsaved changes.
 * https://stackoverflow.com/questions/63064778/next-js-warn-user-for-unsaved-form-before-route-change
 */
export function useConfirmExitPage(okToLeave: boolean) {
  React.useEffect(() => {
    // If closing tab or browser history or input another domain on URL bar.
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (!okToLeave) {
        (e || window.event).returnValue = sureLeaveMessage
        return sureLeaveMessage
      }
    }
    // If exiting by clicking a Next.js link.
    const routeChangeStartHandler = (url: string) => {
      if (!okToLeave && Router.pathname !== url && !confirm(sureLeaveMessage)) {
        // to inform NProgress or something ...
        Router.events.emit('routeChangeError')
        // tslint:disable-next-line: no-string-throw
        throw `Route change to "${url}" was aborted (this error can be safely ignored). See https://github.com/vercel/next.js/discussions/32231`
      }
    }
    Router.events.on('routeChangeStart', routeChangeStartHandler)
    window.addEventListener('beforeunload', beforeUnloadHandler)
    return () => {
      Router.events.off('routeChangeStart', routeChangeStartHandler)
      window.removeEventListener('beforeunload', beforeUnloadHandler)
    }
  }, [okToLeave])
}

// https://stackoverflow.com/questions/4825683/how-do-i-create-and-read-a-value-from-cookie/38699214#38699214
export function setCookie(name, value, days?: number, path = '/') {
  let delta
  if (days === undefined) {
    delta = Number.MAX_SAFE_INTEGER
  } else {
    delta = days * 864e5
  }
  const expires = new Date(Date.now() + delta).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(
    value
  )};expires=${expires};path=${path}`
}

export function setCookies(cookieDict, days, path = '/') {
  for (let key in cookieDict) {
    setCookie(key, cookieDict[key], days, path)
  }
}

export function getCookie(name) {
  return getCookieFromString(document.cookie, name)
}

export function getCookieFromReq(req, name) {
  const cookie = req.headers.cookie
  if (cookie) {
    return getCookieFromString(cookie, name)
  } else {
    return null
  }
}

export function getCookieFromString(s, name) {
  return getCookiesFromString(s)[name]
}

// https://stackoverflow.com/questions/5047346/converting-strings-like-document-cookie-to-objects
export function getCookiesFromString(s) {
  return s.split('; ').reduce((prev, current) => {
    const [name, ...value] = current.split('=')
    prev[name] = value.join('=')
    return prev
  }, {})
}

export function deleteCookie(name, path = '/') {
  setCookie(name, '', -1, path)
}

export async function setupUserLocalStorage(user, setErrors?) {
  // We fetch from /profiles/:username again because the return from /users/login above
  // does not contain the image placeholder.
  const { data: userData, status: userStatus } = await webApi.user(
    user.username
  )
  user.effectiveImage = userData.effectiveImage
  window.localStorage.setItem(
    AUTH_LOCAL_STORAGE_NAME,
    JSON.stringify(user)
  );
  setCookie(AUTH_COOKIE_NAME, user.token)
  mutate(AUTH_COOKIE_NAME, user.token)
  mutate(AUTH_LOCAL_STORAGE_NAME, user);
}

// URL Fragment handling

/**
 * Based on the given URL path, decide the short version of a given long fragment:
 * on /user: user/mathematics -> mathematics
 * on /user: _toc/user/mathematics -> _toc/mathematics
 * on /user/mathematics: user/algebra -> algebra
 * on /user/has-scope: user/has-scope/no-scope -> no-scope
 */
export function getShortFragFromLongForPath(fragNoHash, pathNoSlash) {
  // e.g. mathematics/
  const path = pathNoSlash + '/'
  let prefix
  if (fragNoHash.startsWith(Macro.TOC_PREFIX)) {
    prefix = Macro.TOC_PREFIX
    fragNoHash = fragNoHash.replace(prefix, '')
  } else {
    prefix = ''
  }
  let removePrefix
  if (fragNoHash === pathNoSlash) {
    // Toplevel element '#mathematics' -> '#'
    removePrefix = pathNoSlash
  } else if (fragNoHash.startsWith(path)) {
    // Toplevel "mathematics" has scope, e.g. /username/mathematics.
    // So we convert #username/mathematics/algebra to #algebra
    removePrefix = path
  } else {
    removePrefix = pathNoSlash.split('/').slice(0, -1).join('/') + '/'
  }
  return prefix + fragNoHash.replace(removePrefix, '')
}

export function getShortFragFromLong(fragNoHash) {
  return getShortFragFromLongForPath(fragNoHash, window.location.pathname.substring(1))
}

/** Modify the current URL to have this hash. Do not add alter browser history. */
export function replaceFrag(fragNoHash) {
  const newUrl = window.location.pathname + window.location.search + '#' + fragNoHash
  // Using this internal-looking API works. Not amazing, bu we can't find a better way.
  // replaceState first arg is an arbitrary object, and we just make it into what Next.js uses.
  // https://github.com/vercel/next.js/discussions/18072
  window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
  // Makes user/mathematics -> user/mathematics#algebra -> user/linear-algebra -> browser back history button work
  // However makes: user/mathematics -> user/mathematics#algebra -> user/mathematics#linear-algebra -> browser back history button work
  // give "Error: Cancel rendering route"
  //await Router.replace(shortFrag)
}

/** Input: we are in an url with long fragment such as #barack-obama/mathematics
 * Outcome: replace the URL fragment with the corresponding short one without altering browser history. */
export function replaceShortFrag() {
  replaceFrag(getShortFragFromLong(window.location.hash.substring(1)))
}

/** Use explicit .target class to overcome https://github.com/ourbigbook/ourbigbook/issues/302 */
export function fragSetTarget(elem: HTMLElement) {
  const es = window.document.getElementsByClassName('target')
  for (let i = 0; i < es.length; i++) {
    es[i].classList.remove('target')
  }
  elem.classList.add('target')
}

/** Does everything we want to do on our short fragment redirection hacks, e.g. when you click
  * a link to an element that is in the current page. Supposes that the element is for sure in page.  */
export function shortFragGoTo(
  handleShortFragmentSkipOnce: React.MutableRefObject<boolean>,
  shortFrag: string,
  longFrag: string,
  targetElem: HTMLElement
) {
  handleShortFragmentSkipOnce.current = true
  window.location.hash = longFrag
  replaceFrag(shortFrag)
  fragSetTarget(targetElem)
}

export function orderToPageTitle(order: string): string {
  switch(order) {
    case 'createdAt':
      return 'New'
    case 'score':
      return 'Top'
    case 'updatedAt':
      return 'Recently updated'
  }
}

export function MyHead({ title }) {
  return <Head>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />
    <title>{(title ? `${title} - ` : '') + 'OurBigBook.com'}</title>
  </Head>
}

export function ArticleCreatedUpdatedPills({ article }) {
  return <>
    <span className="pill" title="Last updated">
      <TimeIcon />
      {' '}
      {article.createdAt !== article.updatedAt && <>
        <span className="desktop-hide"><EditArticleIcon /></span>
        <span className="mobile-hide">Updated</span>
        {' '}
      </>}
      <span className="article-dates">
        {formatDate(article.updatedAt)}
      </span>
    </span>
    {article.createdAt !== article.updatedAt &&
      <>
        {' '}
        <span className="pill" title="Created">
          <TimeIcon />
          {' '}
          <span className="desktop-hide"><NewArticleIcon /></span>
          <span className="mobile-hide">Created</span>
          {' '}
          <span className="article-dates">
            {formatDate(article.createdAt)}
          </span>
        </span>
      </>
    }
  </>
}

export async function getRecaptchaToken() : Promise<string|undefined> {
  if (useCaptcha) {
    return new Promise((resolve, reject) => {
      grecaptcha.ready(function() {
        grecaptcha.execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, {action: 'submit'}).then(function(token) {
          resolve(token)
        })
      })
    })
  }
}

export function RecaptchaScript() {
  if (useCaptcha) {
    return <Script src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`} />
  } else {
    return <></>
  }
}

// URL operations.

/** /my/path?aaa=bbb -> /my/path?aaa=000&bbb=111 */
export function addParameterToUrlPath(path, key: string, value: string): string {
  const url = new URL('http://a.com' + path)
  const params = new URLSearchParams(url.search)
  params.set(key, value)
  return `${url.pathname}?${params.toString()}`
}

export function removeParameterFromUrlPath(path, key: string): string {
  const url = new URL('http://a.com' + path)
  const params = new URLSearchParams(url.search)
  params.delete(key)
  let paramsString = params.toString()
  if (paramsString) {
    paramsString = `?${paramsString}`
  }
  return `${url.pathname}${paramsString}`
}
