import axios from 'axios'
import { getCookie } from 'front'
import { AUTH_COOKIE_NAME } from 'front/js'

const updateOptions = () => {
  if (typeof window === "undefined") return {};
  if (!window.localStorage.user) return {};
  if (Object.keys(window.localStorage.user).length === 0) return {};
  const user = JSON.parse(window.localStorage.user);
  if (!!user.token) {
    return {
      headers: {
        Authorization: `Token ${getCookie(AUTH_COOKIE_NAME)}`,
      },
    };
  }
};

export default function fetcher(doFetch=true) {
  return async (url) => {
    if (doFetch) {
      const { data } = await axios.get(url, updateOptions());
      return data;
    }
  }
}
