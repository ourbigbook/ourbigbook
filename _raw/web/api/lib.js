// Ideally, this would be moved entirely to front/js.js to share functionality backend API with Next.js.
// There is just one thing that we haven't managed/tried to much to do on Next.js but which works on Express:
// to raise error pages like 404 by throwing exceptions. So we are keeping only the exception throwing stuff
// here for now. This type of exception interface is very convenient, as it allows you to stop processing
// immediately and return an error from subcalls.

const pluralize = require('pluralize')

const config = require('../front/config')
const front = require('../front/js')
const routes = require('../front/routes')

function checkMaxNewPerTimePeriod({
  errs,
  loggedInUser,
  newCountLastHour,
  newCountLastMinute,
  objectName,
}) {
  if (!config.isTest && !loggedInUser.admin) {
    if (newCountLastMinute > loggedInUser.maxIssuesPerMinute) {
      errs.push(`maximum number of new ${pluralize(objectName)} per minute reached: ${loggedInUser.maxIssuesPerMinute}`)
    }
    if (newCountLastHour > loggedInUser.maxIssuesPerHour) {
      errs.push(`maximum number of new ${pluralize(objectName)} per hour reached: ${loggedInUser.maxIssuesPerHour}`)
    }
  }
}

// Make user like an object such as an Article, Issue or Comment
async function likeObject({
  req,
  res,
  getObject,
  objectName,
  joinModel,
  validateLike,
}) {
  const sequelize = req.app.get('sequelize')
  const [
    obj,
    loggedInUser,
    likeCountByLoggedInUserLastMinute,
    likeCountByLoggedInUserLastHour,
  ] = await Promise.all([
    getObject(req, res),
    sequelize.models.User.findByPk(req.payload.id),
    joinModel.count({ where: {
      userId: req.payload.id,
      createdAt: { [sequelize.Sequelize.Op.gt]: oneMinuteAgo() }
    }}),
    joinModel.count({ where: {
      userId: req.payload.id,
      createdAt: { [sequelize.Sequelize.Op.gt]: oneHourAgo() }
    }}),
  ])
  await validateLike(req, res, loggedInUser, obj, true)
  const errs = []
  checkMaxNewPerTimePeriod({
    errs,
    objectName,
    loggedInUser,
    newCountLastHour: likeCountByLoggedInUserLastHour,
    newCountLastMinute: likeCountByLoggedInUserLastMinute,
  })
  if (errs.length) { throw new ValidationError(errs, 403) }
  if (objectName === 'article') {
    await loggedInUser.addArticleLikeSideEffects(obj)
  } else if (objectName === 'issue') {
    await loggedInUser.addIssueLikeSideEffects(obj)
  } else {
    throw new Error(`unknown object name: ${objectName}`)
  }
  const newObj = await getObject(req, res)
  return res.json({ [objectName]: await newObj.toJson(loggedInUser) })
}

function logPerf(t0, s) {
  if (config.log.perf) {
    const t1 = performance.now()
    console.error(`${s} ${t1 - t0} ms`)
    return t1
  }
}

function validateBodySize(loggedInUser, bodySource) {
  if (!loggedInUser.admin && bodySource.length > loggedInUser.maxArticleSize) {
    throw new ValidationError(
      `The body size (${bodySource.length} bytes) was larger than you maximum article size (${loggedInUser.maxArticleSize} bytes). bodySource:\n${bodySource}`,
      403,
    )
  }
}

async function getArticle(req, res, options={}) {
  const slug = validateParam(req.query, 'id')
  const sequelize = req.app.get('sequelize')
  const article = await sequelize.models.Article.getArticle(Object.assign({ sequelize, slug }, options))
  if (!article) {
    throw new ValidationError(
      [`Article slug not found: "${slug}"`],
      404,
    )
  }
  return article
}

function getOrder(req, opts={}) {
  const [sort, err] = front.getOrder(req, opts)
  if (err) {
    throw new ValidationError(
      [`Invalid sort value: '${sort}'`],
      422,
    )
  }
  return sort
}

function getLimitAndOffset(req, res, opts={}) {
  let { defaultLimit, limitMax } = opts
  if (limitMax === undefined) {
    limitMax = config.articleLimitMax
  }
  if (defaultLimit === undefined) {
    defaultLimit = limitMax
  }
  return [
    validateParam(req.query, 'limit', {
      typecast: front.typecastInteger,
      validators: [
        front.isNonNegativeInteger,
        front.isSmallerOrEqualTo(limitMax),
      ],
      defaultValue: defaultLimit
    }),
    validateParam(req.query, 'offset', {
      typecast: front.typecastInteger,
      validators: [front.isNonNegativeInteger],
      defaultValue: 0
    }),
  ]
}

const MILLIS_PER_MINUTE = 1000 * 60
const MILLIS_PER_HOUR = 60 * MILLIS_PER_MINUTE
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR
const MILLIS_PER_MONTH = 30 * MILLIS_PER_DAY

/**
 * https://stackoverflow.com/questions/19700283/how-to-convert-time-in-milliseconds-to-hours-min-sec-format-in-javascript/32180863#32180863
 *
 * Approximate milliseconds to the nearest time unit.
 *
 * @param {Number} ms
 * @return {string} Sample outputs:
 *                  1.0 Sec
 *                  10.0 Sec
 *                  5.0 Min
 *                  1.0 Hrs
 *                  1.0 Days
 */
function msToRoundedTime(ms) {
  let seconds = (ms / 1000).toFixed(1)
  let minutes = (ms / (MILLIS_PER_MINUTE)).toFixed(1)
  let hours = (ms / (MILLIS_PER_HOUR)).toFixed(1)
  let days = (ms / (1000 * 60 * 60 * 24)).toFixed(1)
  if (seconds < 60) return seconds + " seconds"
  else if (minutes < 60) return minutes + " minutes"
  else if (hours < 24) return hours + " hours"
  else return days + " days"
}

function oneMinuteAgo() {
  return new Date(new Date - 1000 * 60)
}

function oneHourAgo() {
  return new Date(new Date - MILLIS_PER_HOUR)
}

function oneMonthAgo() {
  return new Date(new Date - MILLIS_PER_MONTH)
}

/** https://stackoverflow.com/questions/11335460/how-do-i-parse-a-data-url-in-node 
 * With regex is extremely slow.
 */
function parseDataUriBase64(s) {
  const preAndContent = s.split(';base64,')
  if (preAndContent.length !== 2) {
    throw new ValidationError('invalid data URI')
  }
  const [pre, content] = preAndContent
  if (!pre.startsWith('data:')) {
    throw new ValidationError('invalid data URI')
  }
  let contentType = pre.substring(5)
  return [contentType, Buffer.from(content, 'base64')]
}

async function sendEmail({
  fromName='OurBigBook.com',
  html,
  req,
  subject,
  text,
  to,
}) {
  const msg = {
    to,
    from: {
      email: 'notification@ourbigbook.com',
      name: fromName,
    },
    subject,
    text,
    html,
  }
  if (config.isTest) {
    req.app.get('emails').push(msg)
  } else {
    if (process.env.OURBIGBOOK_SEND_EMAIL === '1' || config.isProduction) {
      const sgMail = require('@sendgrid/mail')
      sgMail.setApiKey(process.env.SENDGRID_API_KEY)
      await sgMail.send(msg)
    } else {
      console.log(`Email sent:
to: ${to}
fromName: ${fromName}
subject: ${subject}
text: ${text}
html: ${html}`)
    }
  }
}

/**
 * Higher level wrapper around sendEmail.
 * 
 * Takes a User object as input rather than the raw email string.
 * 
 * Factors out things such as:
 * * check if the recipient has email notifications enabled  
 * * add the unsubscribe from all emails message
 */
async function sendEmailToUser({
  fromName='OurBigBook.com',
  html,
  req,
  subject,
  text,
  to,
}) {
  if (to.emailNotifications) {
    const settingsUrl = `${routes.host(req)}${routes.userEdit(to.username)}`
    if (html === undefined) {
      html = ''
    }
    html += `<p>To unsubscribe from all ${config.appName} emails ` +
      `<a href="${settingsUrl}">change the email settings on your profile page</a>.</p>\n`
    if (text === undefined) {
      text = ''
    }
    if (text) {
      text += '\n'
    }
    text += `To unsubscribe from all ${config.appName} emails change the email settings on your profile page: ${settingsUrl}\n`
    return sendEmail ({
      fromName,
      html,
      req,
      subject,
      text,
      to: to.email,
    })
  }
}
// When this class is thrown and would blows up on toplevel, we catch it instead
// and gracefully return the specified error to the client instead of doing a 500.
class ValidationError extends Error {
  constructor(errors, status, opts={}) {
    super()
    this.info = opts.info
    this.errors = errors
    if (status === undefined) {
      status = 422
    }
    this.status = status
  }
}

function validate(inputString, validators, prop) {
  if (validators === undefined) {
    validators = [front.isTruthy]
  }
  for (const validator of validators) {
    if (!validator(inputString)) {
      throw new ValidationError(
        { [prop]: [`validator ${validator.name} failed on ${prop} = "${inputString}"`] },
        422,
      )
    }
  }
}

/* Validate some input parameter, e.g. either URL GET param or parsed JSON body.
 *
 * Every such param should be validated like this before getting used, otherwise
 * 500s are likely
 *
 * - typecast: converts strings to other types e.g. integer. This ensures that the type is correct afterwards.
 *             so you don't need to add a type validator to validators.
 *
 *             Body JSON is preparsed by Express for us as a JavaScript object, and types are already converted,
 *             so typecast is not necessary. But then you have to check that types are correct instead.
 * - validators: if any of them returns false, return an error code.
 *               They are not run if the value was not given, the defaultValue is used directly
 *               if it was given in that case.
 * - defaultValue: if not given, will blow up if the param is missing. Can be undefined however
 *                 to allow a default value of undefined.
 **/
function validateParam(obj, prop, opts={}) {
  const { typecast, validators, defaultValue } = opts
  let param = obj[prop]
  if (typeof param === 'undefined') {
    if (!('defaultValue' in opts)) {
      throw new ValidationError(
        { [prop]: [`missing mandatory argument`] },
        422,
      )
    }
    return defaultValue
  } else {
    if (typecast !== undefined) {
      let ok
      ;[param, ok] = typecast(param)
      if (!ok) {
        throw new ValidationError(
          { [prop]: [`typecast ${typecast.name} failed on ${prop} = "${param}"`] },
          422,
        )
      }
    }
    validate(param, validators, prop)
    return param
  }
}

module.exports = {
  ValidationError,
  checkMaxNewPerTimePeriod,
  getArticle,
  getLimitAndOffset,
  getOrder,
  likeObject,
  logPerf,
  oneHourAgo,
  oneMinuteAgo,
  oneMonthAgo,
  MILLIS_PER_HOUR,
  MILLIS_PER_MINUTE,
  MILLIS_PER_MONTH,
  msToRoundedTime,
  parseDataUriBase64,
  sendEmail,
  sendEmailToUser,
  validate,
  validateBodySize,
  validateParam,
}
