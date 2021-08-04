import { escapeUsername } from "config";

export const apiRoutes = {
  articleEdit: (slug) => `/${escapeUsername}/edit/${slug}`,
  articleNew: (slug) => `/${escapeUsername}/new`,
  articleFavorite: (slug) => `/${slug}`,
}

export default {
  home: () => `/`,
  articleEdit: (slug) => `/${escapeUsername}/edit/${slug}`,
  articleNew: (slug) => `/${escapeUsername}/new`,
  articleView: (slug) => `/${slug}`,
  userEdit: () => `/${escapeUsername}/settings`,
  userLogin: () => `/${escapeUsername}/login`,
  userNew: () => `/${escapeUsername}/register`,
  userView: (uid) => `/${uid}`,
  userViewFavorites: (uid) => `/${escapeUsername}/user/favorites/${uid}`,
}
