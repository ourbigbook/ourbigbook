import { apiPath } from 'config'

export const SERVER_BASE_URL = apiPath;
export const APP_NAME = `Cirodown`;
export const ARTICLE_QUERY_MAP = {
  "tab=feed": `${SERVER_BASE_URL}/articles/feed`,
  "tab=tag": `${SERVER_BASE_URL}/articles/tag`
};
export const BUTTON_ACTIVE_CLASS = 'active';
export const DEFAULT_PROFILE_IMAGE = `https://static.productionready.io/images/smiley-cyrus.jpg`;
export const DEFAULT_LIMIT = 20;
export const DEFAULT_USER_SCORE_TITLE = 'sum of scores of all articles authored by user';
