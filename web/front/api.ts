import { WebApi } from 'ourbigbook/web_api'
import { AUTH_COOKIE_NAME, getCookie } from 'front'

export const webApi = new WebApi({
  getToken: () => getCookie(AUTH_COOKIE_NAME),
  https: true,
})
