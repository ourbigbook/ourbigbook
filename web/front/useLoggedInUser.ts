import useSWR from 'swr'
import React from 'react'

import checkLogin from 'front/checkLogin'
import storage from 'front/storage'
import { AUTH_COOKIE_NAME, AUTH_LOCAL_STORAGE_NAME, getCookie } from 'front'

export default function useLoggedInUser() {
    React.useEffect(() => {})
    const { data: authCookie } = useSWR('auth/cookie', () => {
      const ret = getCookie(AUTH_COOKIE_NAME)
      if (!ret) {
        // E.g. if the test database was nuked, the GET request sees wrong auth,
        // and removes the cookie with a HEADER. And now here we noticed that on
        // the JavaSript, so we get rid of it. Notably, this removes the logged in
        // user from the navbar.
        window.localStorage.removeItem(AUTH_LOCAL_STORAGE_NAME);
      }
      return ret
    })
    const { data: loggedInUser } = useSWR(() => authCookie ? 'user' : null, storage);
    if (loggedInUser === undefined) return loggedInUser
    const isLoggedIn = checkLogin(loggedInUser);
    if (isLoggedIn) {
      return loggedInUser;
    } else {
      return null;
    }
}
