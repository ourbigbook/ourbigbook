import { WebApi } from 'ourbigbook/web_api'
import { getCookie } from 'front'
import { AUTH_COOKIE_NAME } from 'front/js'

export const webApi = new WebApi({
  getToken: () => getCookie(AUTH_COOKIE_NAME),
  https: true,
})
