import axios from "axios";

import { SERVER_BASE_URL } from "lib/utils/constant";
import { addAuthHeader } from "./lib"

const UserAPI = {
  current: async () => {
    const user: any = window.localStorage.getItem("user");
    const token = user?.token;
    try {
      const response = await axios.get(`/users`, {
        headers: addAuthHeader(token),
      });
      return response;
    } catch (error) {
      return error.response;
    }
  },

  follow: async (username) => {
    const user: any = JSON.parse(window.localStorage.getItem("user"));
    const token = user?.token;
    try {
      const response = await axios.post(
        `${SERVER_BASE_URL}/users/${username}/follow`,
        {},
        {
          headers: addAuthHeader(token),
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },

  get: async username => axios.get(UserAPI.url(username)),

  login: async (email, password) => {
    try {
      const response = await axios.post(
        `${SERVER_BASE_URL}/login`,
        JSON.stringify({ user: { email, password } }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },

  register: async (username, email, password) => {
    try {
      const response = await axios.post(
        `${SERVER_BASE_URL}/users`,
        JSON.stringify({ user: { username, email, password } }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },

  save: async (user) => {
    try {
      const response = await axios.put(
        `${SERVER_BASE_URL}/users`,
        JSON.stringify({ user }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },

  update: (user, token) => axios.put(
    UserAPI.url(user.username),
    JSON.stringify({ user }),
    {
      headers: addAuthHeader(token, {
        "Content-Type": "application/json",
      }),
    }
  ),

  unfollow: async (username) => {
    const user: any = JSON.parse(window.localStorage.getItem("user"));
    const token = user?.token;
    try {
      const response = await axios.delete(
        `${SERVER_BASE_URL}/users/${username}/follow`,
        {
          headers: addAuthHeader(token),
        }
      );
      return response;
    } catch (error) {
      return error.response;
    }
  },

  url: username => `${SERVER_BASE_URL}/users/${username}`,
};

export default UserAPI;
