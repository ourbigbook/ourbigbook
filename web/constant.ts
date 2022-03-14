import { apiPath } from 'front/config'

export const SERVER_BASE_URL = apiPath;
export const ABOUT_HREF = "https://cirosantilli.com/ourbigbook-com"
export const APP_NAME = `OurBigBook.com`;
export const ARTICLE_QUERY_MAP = {
  "tab=feed": `${SERVER_BASE_URL}/articles/feed`,
};
export const BUTTON_ACTIVE_CLASS = 'active';
export const DEFAULT_PROFILE_IMAGE = `https://static.productionready.io/images/smiley-cyrus.jpg`;
export const DEFAULT_LIMIT = 20;
export const DEFAULT_USER_SCORE_TITLE = 'Sum of likes of all articles authored by user';
