import cirodown from 'cirodown/dist/cirodown.js';

export const LOGIN_ACTION = 'Sign in'
export const REGISTER_ACTION = 'Sign up'

export function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1)
}

export function decapitalize(s) {
  return s[0].toLowerCase() + s.slice(1)
}

export function slugFromArray(arr) {
  return arr.join(cirodown.Macro.HEADER_SCOPE_SEPARATOR)
}

export function slugFromRouter(router) {
  return slugFromArray(router.query.slug)
}
