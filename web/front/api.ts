import ArticleApiClass from 'ourbigbook/web_api/article'
import CommentApiClass from 'ourbigbook/web_api/comment'
import UserApiClass from 'ourbigbook/web_api/user'
import { AUTH_COOKIE_NAME, getCookie } from 'front'

const opts = {
  getToken: () => getCookie(AUTH_COOKIE_NAME),
  https: true,
}
export const ArticleApi = new ArticleApiClass(opts)
export const CommentApi = new CommentApiClass(opts)
export const UserApi = new UserApiClass(opts)
