import axios from "axios";

import { SERVER_BASE_URL } from "lib/utils/constant";
import { getQuery } from "lib/utils/getQuery";
import { addAuthHeader } from "./lib"

const ArticleAPI = {
  all: (page, limit = 10) =>
    axios.get(`${SERVER_BASE_URL}/articles?${getQuery(limit, page)}`),

  byAuthor: (author, page = 0, limit = 5) =>
    axios.get(
      `${SERVER_BASE_URL}/articles?author=${encodeURIComponent(
        author
      )}&${getQuery(limit, page)}`
    ),

  byTag: (tag, page = 0, limit = 10) =>
    axios.get(
      `${SERVER_BASE_URL}/articles?tag=${encodeURIComponent(tag)}&${getQuery(
        limit,
        page
      )}`
    ),

  create: async (article, token) => {
    const { data, status } = await axios.post(
      `${SERVER_BASE_URL}/articles`,
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
    axios.delete(`${SERVER_BASE_URL}/articles?id=${slug}`, {
      headers: addAuthHeader(token),
    }),

  favorite: (slug, token) => {
    axios.post(
      `${SERVER_BASE_URL}/articles/favorite?id=${slug}`,
      {},
      {
        headers: addAuthHeader(token),
      }
    )
  },

  favoritedBy: (author, page) =>
    axios.get(
      `${SERVER_BASE_URL}/articles?favorited=${encodeURIComponent(
        author
      )}&${getQuery(10, page)}`
    ),

  feed: (page, limit = 10) =>
    axios.get(`${SERVER_BASE_URL}/articles/feed?${getQuery(limit, page)}`),

  get: (slug) => axios.get(ArticleAPI.url(slug)),

  unfavorite: (slug, token) =>
    axios.delete(
      `${SERVER_BASE_URL}/articles/favorite?id=${encodeURIComponent(slug)}`,
      {
        headers: addAuthHeader(token),
      }
    ),

  update: async (article, slug, token) => {
    const { data, status } = await axios.put(
      `${SERVER_BASE_URL}/articles?id=${encodeURIComponent(slug)}`,
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

  url: (slug) => `${SERVER_BASE_URL}/articles?id=${encodeURIComponent(slug)}`,
};

export default ArticleAPI;
