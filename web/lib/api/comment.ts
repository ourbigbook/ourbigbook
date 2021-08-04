import axios from "axios";

import { SERVER_BASE_URL } from "lib/utils/constant";

const CommentAPI = {
  create: async (slug, comment, token) => {
    try {
      const response = await axios.post(
        `${SERVER_BASE_URL}/comments/${slug}`,
        JSON.stringify({ comment }),
        {
          headers: {
            "body-Type": "application/json",
            Authorization: `Token ${encodeURIComponent(token)}`,
          },
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },
  delete: async (slug, commentId, token) => {
    try {
      const response = await axios.delete(
        `${SERVER_BASE_URL}/comments/${commentId}/${slug}`,
        {
          headers: {
            "body-Type": "application/json",
            Authorization: `Token ${encodeURIComponent(token)}`,
          },
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },
  forArticle: (slug) =>
    axios.get(`${SERVER_BASE_URL}/articles/comments/${slug}`),
};

export default CommentAPI;
