/** This files contains functionality that is shared between
 * ourbigbook_runtime and the main conversion codebase.
 *
 * The main goal of having this separate file is to prevent the
 * entire conversion codebase from going into the runtime code
 * to reduce what readers need to download each time.
 *
 * Maybe there is a way to get webpack to do that pruning for us,
 * but let's just be dumb this time.
 */

const lodash = require('lodash')

const AT_MENTION_CHAR = '@'
exports.AT_MENTION_CHAR = AT_MENTION_CHAR
const GREEK_MAP = {
  '\u{03b1}': 'alpha',
  '\u{0391}': 'Alpha',
  '\u{03b2}': 'beta',
  '\u{0392}': 'Beta',
  '\u{03b3}': 'gamma',
  '\u{0393}': 'Gamma',
  '\u{03b4}': 'delta',
  '\u{0394}': 'Delta',
  '\u{03b5}': 'epsilon',
  '\u{0395}': 'Epsilon',
  '\u{03b6}': 'zeta',
  '\u{0396}': 'Zeta',
  '\u{03b7}': 'eta',
  '\u{0397}': 'Eta',
  '\u{03b8}': 'theta',
  '\u{0398}': 'Theta',
  '\u{03b9}': 'iota',
  '\u{0399}': 'Iota',
  '\u{03ba}': 'kappa',
  '\u{039a}': 'Kappa',
  '\u{03bb}': 'lambda',
  '\u{039b}': 'Lambda',
  '\u{03bc}': 'mu',
  '\u{039c}': 'Mu',
  '\u{03bd}': 'nu',
  '\u{039d}': 'Nu',
  '\u{03be}': 'xi',
  '\u{039e}': 'Xi',
  '\u{03bf}': 'omicron',
  '\u{039f}': 'Omicron',
  '\u{03c0}': 'pi',
  '\u{03a0}': 'Pi',
  '\u{03c1}': 'rho',
  '\u{03a1}': 'Rho',
  '\u{03c3}': 'sigma',
  '\u{03a3}': 'Sigma',
  '\u{03c4}': 'tau',
  '\u{03a4}': 'Tau',
  '\u{03c5}': 'upsilon',
  '\u{03a5}': 'Upsilon',
  '\u{03c6}': 'phi',
  '\u{03a6}': 'Phi',
  '\u{03c7}': 'chi',
  '\u{03a7}': 'Chi',
  '\u{03c8}': 'psi',
  '\u{03a8}': 'Psi',
  '\u{03c9}': 'omega',
  '\u{03a9}': 'Omega',
}
const HEADER_SCOPE_SEPARATOR = '/'
exports.HEADER_SCOPE_SEPARATOR = HEADER_SCOPE_SEPARATOR
const NORMALIZE_PUNCTUATION_CHARACTER_MAP = {
  '%': 'percent',
  '&': 'and',
  '+': 'plus',
  '@': 'at',
  '\u{2212}': 'minus',
}
const ID_SEPARATOR = '-'
exports.ID_SEPARATOR = ID_SEPARATOR

/** https://stackoverflow.com/questions/14313183/javascript-regex-how-do-i-check-if-the-string-is-ascii-only/14313213#14313213 */
function isAscii(str) {
  return /^[\x00-\x7F]*$/.test(str);
}

// https://docs.ourbigbook.com#ascii-normalization
function normalizeLatinCharacter(c) {
  c = lodash.deburr(c)
  if (c in GREEK_MAP) {
    return ID_SEPARATOR + GREEK_MAP[c] + ID_SEPARATOR
  }
  switch(c) {
    // en-dash
    case '\u{2013}':
    // em-dash
    case '\u{2014}':
      return ID_SEPARATOR
  }
  return c
}

function normalizePunctuationCharacter(c) {
  if (c in NORMALIZE_PUNCTUATION_CHARACTER_MAP) {
    return ID_SEPARATOR + NORMALIZE_PUNCTUATION_CHARACTER_MAP[c] + ID_SEPARATOR
  } else {
    return c
  }
}

/** A good default-ish title-to-id. Ideally we should also
 * record the convert options in a Js variable and use those exact same options here
 * to get a more precise search. But this will be good enough for now. */
function titleToId(title, options={}) {
  let {
    keepScopeSep,
    magic,
    normalizeLatin,
    normalizePunctuation,
    removeLeadingAt,
  } = options
  if (keepScopeSep === undefined) {
    keepScopeSep = false
  }
  if (magic === undefined) {
    magic = true
  }
  if (normalizeLatin === undefined) {
    normalizeLatin = true
  }
  if (normalizePunctuation === undefined) {
    normalizePunctuation = true
  }
  if (removeLeadingAt === undefined) {
    removeLeadingAt = true
  }
  const new_chars = []
  let first = true
  for (let c of title) {
    if (normalizeLatin) {
      c = normalizeLatinCharacter(c)
    }
    if (
      normalizePunctuation &&
      !(
        first &&
        c === AT_MENTION_CHAR &&
        magic &&
        removeLeadingAt
      )
    ) {
      c = normalizePunctuationCharacter(c)
    }
    c = c.toLowerCase()
    const scope_sep = keepScopeSep ? HEADER_SCOPE_SEPARATOR : ''
    const ok_chars_regexp = new RegExp(`[a-z0-9-${scope_sep}]`)
    if (
      !isAscii(c) ||
      ok_chars_regexp.test(c)
    ) {
      new_chars.push(c)
    } else {
      new_chars.push(ID_SEPARATOR)
    }
    first = false
  }
  return new_chars.join('')
    .replace(new RegExp(ID_SEPARATOR + '+', 'g'), ID_SEPARATOR)
    .replace(new RegExp('^' + ID_SEPARATOR + '+'), '')
    .replace(new RegExp(ID_SEPARATOR + '+$'), '')
}
exports.titleToId = titleToId

/* After this timeout, assume use stopped typing and start making network requests / error messages.
 * This is to reduce flickering and the number of network requests. */
const USER_FINISHED_TYPING_MS = 200
exports.USER_FINISHED_TYPING_MS = USER_FINISHED_TYPING_MS
