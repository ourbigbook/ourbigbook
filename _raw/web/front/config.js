const ourbigbook = require('ourbigbook')
const { read_include } = require('ourbigbook/web_api')
const ourbigbook_nodejs_front = require('ourbigbook/nodejs_front')

const escapeUsername = 'go'

let databaseUrl
if (process.env.NODE_ENV === 'test') {
  databaseUrl = process.env.DATABASE_URL_TEST
} else {
  databaseUrl = process.env.DATABASE_URL
}
let databaseName = process.env.OURBIGBOOK_DB_NAME
if (!databaseName) {
  databaseName = ourbigbook_nodejs_front.isTest ? 'ourbigbook_test' : 'ourbigbook'
}

const appDomain = 'ourbigbook.com'
const appNameShort  = 'OurBigBook'
const docsUrl = `https://docs.${appDomain}`

let dbSettings
if (ourbigbook_nodejs_front.postgres) {
  dbSettings = Object.assign(
    {
      url:
        databaseUrl ||
        `postgres://ourbigbook_user:a@localhost:5432/${databaseName}`,
      logging: true,
    },
    ourbigbook_nodejs_front.sequelize_postgres_opts
  )
} else {
  dbSettings = {
    dialect: 'sqlite',
    logging: true,
    storage: ourbigbook_nodejs_front.SQLITE_DB_BASENAME,
  }
}

const convertOptions = {
  add_test_instrumentation: ourbigbook_nodejs_front.isTest,
  body_only: true,
  forbid_include: '\\Include is not allowed on OurBigBook Web, the article tree can be manipulated directly via the UI',
  htmlXExtension: false,
  renderH2: true,
  path_sep: '/',
  // https://docs.ourbigbook.com/todo/word-count-on-web
  show_descendant_count: false,
  render_metadata: false,
  webMode: true,
  x_absolute: true,
  x_leading_at_to_web: false,
  x_remove_leading_at: true,
  xss_safe: true,
}

const apiPath = '/' + ourbigbook.WEB_API_PATH
const uploadPath = apiPath + '/upload'
const profilePicturePathComponent = 'profile'
const profilePicturePath = uploadPath + '/' + profilePicturePathComponent
const allowedImageContentTypesArr = [
  'image/jpeg',
  'image/png',
]
const allowedImageContentTypesSimplifiedArr = allowedImageContentTypesArr.map(t => t.split('/')[1])
module.exports = {
  aboutUrl: `${docsUrl}`,
  allowedImageContentTypes: new Set(allowedImageContentTypesArr),
  allowedImageContentTypesArr,
  allowedImageContentTypesSimplifiedArr,
  apiPath,
  appDomain,
  appNameShort,
  appName: `${appNameShort}.com`,
  // For things like "article in same topic on topic page"
  articleLimitSmall: 5,
  // Default.
  articleLimit: 20,
  // Max allowed to be set by user.
  articleLimitMax: 20,
  buttonActiveClass: 'active',
  commentsHeaderId: `${ourbigbook.Macro.RESERVED_ID_PREFIX}comments`,
  commentIdPrefix: `${ourbigbook.Macro.RESERVED_ID_PREFIX}comment-`,
  // Common convert options used by all frontend components: the backend and the editor,
  // for both issues and articles.
  contactUrl: `${docsUrl}/contact`,
  convertContext: ourbigbook.convertInitContext(convertOptions),
  convertOptions,
  docsUrl,
  docsAdminUrl: `${docsUrl}/ourbigbook-web-admin`,
  donateUrl: `${docsUrl}#donate`,
  defaultProfileImage: `/default-profile-image.svg`,
  disableFrontend: process.env.OURBIGBOOK_DISABLE_FRONTEND === env_true,
  defaultUserScoreTitle: 'Sum of likes of all articles authored by user',
  // Reserved username to have URLs like /username/my-article and /view/editor/my-article.
  escapeUsername,
  /** @type {boolean | 'blocking'} */
  fallback: 'blocking',
  forbidMultiheaderMessage: 'headers are not allowed in OurBigBook Web Articles. Instead create a new article with the "New" button and set its parent to the current article.',
  googleAnalyticsId: 'G-R721ZZTW7L',
  hideArticleDatesDate: '1970-01-01T00:00:00.000Z',
  // An ID separator that should be used or all IDs in the website to avoid conflicts with OurBigBook Markup output,
  // of which users can control IDs to some extent. Usage is like: prefix + sep + number.
  isTest: ourbigbook_nodejs_front.isTest,
  // Default isProduction check. Affects all aspects of the application unless
  // they are individually overridden, including:
  // * is Next.js server dev or prod?
  // * use SQLite or PostgreSQL?
  // * in browser effects, e.g. show Google Analytics or not?
  // * print emails to stdout or actually try to send them
  isProduction: ourbigbook_nodejs_front.isProduction,
  // Overrides isProduction for the "is Next.js server dev or prod?" only.
  isProductionNext: process.env.NODE_ENV_NEXT_SERVER_ONLY === undefined
    ? (ourbigbook_nodejs_front.isProduction)
    : (process.env.NODE_ENV_NEXT_SERVER_ONLY === 'production')
  ,
  log: {
    db: process.env.OURBIGBOOK_LOG_DB === ourbigbook_nodejs_front.env_true,
    perf: process.env.NEXT_PUBLIC_OURBIGBOOK_LOG_PERF === env_true || process.env.OURBIGBOOK_LOG_PERF === env_true,
  },
  // Per user limit defaults.
  maxArticleTitleSize: 1024,
  // Wikipedia also seems to start complaining at about that size:
  // "This article may be too long to read and navigate comfortably. Its current readable prose size is 108 kilobytes."
  // https://archive.ph/cH0Rk
  maxArticleSize: 50000,
  maxArticles: 10000,
  maxArticlesInMemory: 1000,
  maxArticlesFetch: 100,
  maxArticlesFetchToc: 1000,
  maxArticleAnnounceMessageLength: 1000,
  maxArticleAnnouncesPerMonth: 5,
  maxIssuesPerMinute: 6,
  maxIssuesPerHour: 60,
  // After this timeout, assume network is slow and start showing loading messages.
  // This is to reduce flickering.
  networkSlowMs: 500,
  read_include_web: function(id_exists) {
    return read_include({
      exists: async (inpath) => {
        const suf = ourbigbook.Macro.HEADER_SCOPE_SEPARATOR + ourbigbook.INDEX_BASENAME_NOEXT
        let idid
        if (inpath.endsWith(suf)) {
          idid = inpath.slice(0, -suf.length)
        } else {
          idid = inpath
        }
        return id_exists(idid)
      },
      // Only needed for --embed-includes, which is not implemented on the dynamic website for now.
      read: (inpath) => '',
      path_sep: ourbigbook.Macro.HEADER_SCOPE_SEPARATOR,
      ext: '',
    })
  },
  maxUsersInMemory: 1000,
  port: process.env.PORT || 3000,
  postgres: ourbigbook_nodejs_front.postgres,
  profilePictureMaxUploadSize: 2000000,
  profilePicturePath,
  profilePicturePathComponent,
  reservedUsernames: new Set([
    ourbigbook.WEB_API_PATH,
    escapeUsername,
  ]),
  revalidate: 10,
  secret: ourbigbook_nodejs_front.isProduction ? process.env.SECRET : 'secret',
  sureLeaveMessage: 'Your change may be unsaved, are you sure you want to leave this page?',
  uploadPath,
  useCaptcha: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY !== undefined && !ourbigbook_nodejs_front.isTest,
  usernameMinLength: 3,
  usernameMaxLength: 40,
  topicConsiderNArticles: 10,

  // Used by sequelize-cli as well as our source code.
  development: dbSettings,
  production: dbSettings,
}
