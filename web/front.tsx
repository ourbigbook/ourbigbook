import React from 'react'
import Router from 'next/router'
import { mutate } from 'swr'

import ourbigbook from 'ourbigbook/dist/ourbigbook.js';

import { webApi } from 'front/api'
import CustomLink from 'front/CustomLink'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'

export const AUTH_COOKIE_NAME = 'auth'
export const AUTH_LOCAL_STORAGE_NAME = 'user'
export const LOGIN_ACTION = 'Sign in'
export const REGISTER_ACTION = 'Sign up'

export function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1)
}

export function decapitalize(s) {
  return s[0].toLowerCase() + s.slice(1)
}

export function DiscussionAbout(
  { article, issue }:
  { article?: ArticleType; issue?: IssueType }
) {
  return <h1>Discussion{issue ? ` #${issue.number}` : ''}: <a href={routes.article(article.slug)}
    >"<span className="comment-body ourbigbook-title" dangerouslySetInnerHTML={{ __html: article.titleRender }}
    />" by { article.author.displayName }</a></h1>
}

export function SignupOrLogin(
  { to }:
  { to: string }
) {
  return <>
    <CustomLink href={routes.userNew()}>
      {REGISTER_ACTION}
    </CustomLink>
    {' '}or{' '}
    <CustomLink href={routes.userLogin()}>
      {decapitalize(LOGIN_ACTION)}
    </CustomLink>
    {' '}{to}.
  </>
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
  title: string
  setTitle: React.Dispatch<any> | undefined
}>({
  title: '',
  setTitle: undefined,
});

// Global state.
export const AppContextProvider = ({ children }) => {
  const [title, setTitle] = React.useState()
  return <AppContext.Provider value={{
    title, setTitle,
  }}>
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

export function useEEdit(canEdit, slug) {
  React.useEffect(() => {
    function listener(e) {
      if (e.code === 'KeyE') {
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
