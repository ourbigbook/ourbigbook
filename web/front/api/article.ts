import axios from 'axios'

import { apiPath } from 'front/config'
import { getQuery } from 'getQuery'
import { addAuthHeader } from './lib'

const ArticleAPI = {
  all: (page, limit = 10) =>
    axios.get(`${apiPath}/articles?${getQuery(limit, page)}`),

  byAuthor: (author, page = 0, limit = 5) =>
    axios.get(
      `${apiPath}/articles?author=${encodeURIComponent(
        author
      )}&${getQuery(limit, page)}`
    ),

  create: async (article, token) => {
    const { data, status } = await axios.post(
      `${apiPath}/articles`,
      JSON.stringify({ article }),
      {
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
      }
    );
    return {
      data,
      status,
    };
  },

  delete: (slug, token) =>
    axios.delete(`${apiPath}/articles?id=${slug}`, {
      headers: addAuthHeader(token),
    }),

  like: (slug, token) => {
    axios.post(
      `${apiPath}/articles/like?id=${slug}`,
      {},
      {
        headers: addAuthHeader(token),
      }
    )
  },

  likedBy: (author, page) =>
    axios.get(
      `${apiPath}/articles?liked=${encodeURIComponent(
        author
      )}&${getQuery(10, page)}`
    ),

  feed: (page, limit = 10) =>
    axios.get(`${apiPath}/articles/feed?${getQuery(limit, page)}`),

  get: (slug) => axios.get(ArticleAPI.url(slug)),

  unlike: (slug, token) =>
    axios.delete(
      `${apiPath}/articles/like?id=${encodeURIComponent(slug)}`,
      {
        headers: addAuthHeader(token),
      }
    ),

  update: async (article, slug, token) => {
    const { data, status } = await axios.put(
      `${apiPath}/articles?id=${encodeURIComponent(slug)}`,
      JSON.stringify({ article }),
      {
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
      }
    );
    return {
      data,
      status,
    };
  },

  url: (slug) => `${apiPath}/articles?id=${encodeURIComponent(slug)}`,
};

export default ArticleAPI;
