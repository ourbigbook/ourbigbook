/** This file exists because nodejs_webpack_safe.js was not actually webpack safe and gave warning:
 * Critical dependency: the request of a dependency is an expression
 * See further comments on that file.
 */

/**
 * Checks if IP is blocked for signup. Also considers IP prefixes.
 *
 * @param {String|undefined} ip E.g. 123.456.789.1. If undefined, always returns undefined.
 * @return {SignupBlacklisIp|undefined} if blocked, the string prefix that blocks it
 *                            Otherwise, undefined.
 */
async function isIpBlockedForSignup(sequelize, ip, opts={}) {
  const { transaction } = opts
  if (ip) {
    const { SignupBlacklistIp } = sequelize.models
    const promises = []
    for (let i = 1; i <= 4; i++) {
      promises.push(
        SignupBlacklistIp.findOne({
          transaction,
          where: { ip: ip.split('.').slice(0, i).join('.') },
        })
      )
    }
    return (await Promise.all(promises)).find(e => !!e)
  } else {
    return undefined
  }
}

module.exports = {
  isIpBlockedForSignup,
}
