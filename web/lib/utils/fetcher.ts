import axios from 'axios'

const updateOptions = () => {
  if (typeof window === "undefined") return {};
  if (!window.localStorage.user) return {};
  if (Object.keys(window.localStorage.user).length === 0) return {};
  const user = JSON.parse(window.localStorage.user);
  if (!!user.token) {
    return {
      headers: {
        Authorization: `Token ${user.token}`,
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
