import ArticleApi from 'ourbigbook/web_api/article'
import CommentApi from 'ourbigbook/web_api/comment'
import UserApi from 'ourbigbook/web_api/user'
import { AUTH_COOKIE_NAME, getCookie } from 'front'

const opts = {
  getToken: () => getCookie(AUTH_COOKIE_NAME),
  https: true,
}
export const articleApi = new ArticleApi(opts)
export const commentApi = new CommentApi(opts)
export const userApi = new UserApi(opts)
