import axios from 'axios'

import { apiPath } from 'front/config'
import { addAuthHeader } from './lib'

const CommentAPI = {
  create: async (slug, comment, token) => {
    const response = await axios.post(
      `${apiPath}/comments?id=${encodeURIComponent(slug)}`,
      JSON.stringify({ comment: { body: comment } }),
      {
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
      }
    );
    return response;
  },

  delete: async (slug, commentId, token) => {
    const response = await axios.delete(
      `${apiPath}/comments/${commentId}`,
      {
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
      }
    );
    return response;
  },

  url: (slug) => `${apiPath}/comments?id=${encodeURIComponent(slug)}`,
};

export default CommentAPI;
