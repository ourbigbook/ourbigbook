import cirodown from 'cirodown/dist/cirodown.js';

export function slugFromArray(arr) {
  return arr.join(cirodown.Macro.HEADER_SCOPE_SEPARATOR)
}

export function slugFromRouter(router) {
  return slugFromArray(router.query.slug)
}
