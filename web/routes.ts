import { ESCAPE_USERNAME } from "config";

export const apiRoutes = {
  articleEdit: (slug) => `/${ESCAPE_USERNAME}/edit/${slug}`,
  articleNew: (slug) => `/${ESCAPE_USERNAME}/new`,
  articleFavorite: (slug) => `/${slug}`,
}

export default {
  home: () => `/`,
  articleEdit: (slug) => `/${ESCAPE_USERNAME}/edit/${slug}`,
  articleNew: () => `/${ESCAPE_USERNAME}/new`,
  articleView: (slug) => `/${slug}`,
  userEdit: () => `/${ESCAPE_USERNAME}/settings`,
  userLogin: () => `/${ESCAPE_USERNAME}/login`,
  userNew: () => `/${ESCAPE_USERNAME}/register`,
  userView: (uid) => `/${uid}`,
  userViewFavorites: (uid) => `/${ESCAPE_USERNAME}/user/favorites/${uid}`,
  userViewLatest: (uid) => `/${ESCAPE_USERNAME}/user/latest/${uid}`,
  topicArticlesView: (id) => `/${ESCAPE_USERNAME}/topic/${id}`,
  topicUsersView: (id) => `/${ESCAPE_USERNAME}/topic-users/${id}`,
}
