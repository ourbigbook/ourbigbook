import cirodown from 'cirodown/dist/cirodown.js';

export function slugFromRouter(router) {
  return router.query.slug.join(cirodown.Macro.HEADER_SCOPE_SEPARATOR)
}
