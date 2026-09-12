// Named anchors and comment scopes are generated from source when rerendering.
// No persistent IDs or paths need migration. Retain this entry for databases
// that already recorded the migration; rendered HTML is never edited here.
module.exports = {
  up: async () => {},
  down: async () => {},
}
