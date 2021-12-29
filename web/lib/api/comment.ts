import axios from 'axios'

import { SERVER_BASE_URL } from 'lib/utils/constant'
import { addAuthHeader } from './lib'

const CommentAPI = {
  create: async (slug, comment, token) => {
    const response = await axios.post(
      `${SERVER_BASE_URL}/comments?id=${encodeURIComponent(slug)}`,
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
      `${SERVER_BASE_URL}/comments/${commentId}`,
      {
        headers: addAuthHeader(token, {
          "Content-Type": "application/json",
        }),
      }
    );
    return response;
  },

  url: (slug) => `${SERVER_BASE_URL}/comments?id=${encodeURIComponent(slug)}`,
};

export default CommentAPI;
