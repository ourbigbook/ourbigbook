import useSWR from 'swr'

import checkLogin from 'front/checkLogin'
import storage from 'front/storage'
import { AUTH_COOKIE_NAME, AUTH_LOCAL_STORAGE_NAME, getCookie } from 'front'

// @return * undefined: don't know yet, waiting to access local memory asynchronously
//         * null: checked and we are definitely not logged in.
export default function useLoggedInUser() {
  const { data: authCookie } = useSWR(
    AUTH_COOKIE_NAME,
    () => {
      const ret = getCookie(AUTH_COOKIE_NAME)
      if (!ret) {
        // E.g. if the test database was nuked, the GET request sees wrong auth,
        // and removes the cookie with a HEADER. And now here we noticed that on
        // the JavaSript, so we get rid of it. Notably, this removes the logged in
        // user from the navbar.
        window.localStorage.removeItem(AUTH_LOCAL_STORAGE_NAME);
        return null
      }
      return ret
    }
  )
  const { data: loggedInUser } = useSWR(
    () => authCookie ? AUTH_LOCAL_STORAGE_NAME : null,
    () => {
      const ret = storage(AUTH_LOCAL_STORAGE_NAME)
      if (ret === undefined) {
        return null
      } else {
        return ret
      }
    }
  );
  if (authCookie === null) {
    return null;
  }
  if (loggedInUser === undefined) return loggedInUser
  const isLoggedIn = checkLogin(loggedInUser);
  if (isLoggedIn) {
    return loggedInUser;
  } else {
    return null;
  }
}
