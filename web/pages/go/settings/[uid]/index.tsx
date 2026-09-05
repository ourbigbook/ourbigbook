import Router from 'next/router'
import React from 'react'

import lodash from 'lodash'

import {
  allowedImageContentTypes,
  allowedImageContentTypesArr,
  allowedImageContentTypesSimplifiedArr,
  contactUrl,
  docsUrl,
  docsAccountLockingUrl,
  profilePictureMaxUploadSize,
} from 'front/config'
import CustomImage from 'front/CustomImage'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  addCommasToInteger,
  AppContext,
  ErrorIcon,
  HelpIcon,
  LockIcon,
  MyHead,
  OkIcon,
  SettingsIcon,
  setupUserLocalStorage,
  useCtrlEnterSubmit
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { UserType } from 'front/types/UserType'
import { displayAndUsernameText } from 'front/user'
import { formatNumberApprox } from 'ourbigbook'

const maxArticlesLabel = "Maximum number of articles, issues and comments (maxArticles)"
const maxArticleSizeLabel = "Maximum article/issue/comment size (maxArticleSize)"
const maxUploadsLabel = "Maximum number of uploads (maxUploads)"
const maxUploadSizeLabel = "Maximum upload size (maxUploadSize)"
const maxIssuesPerMinuteLabel = "Maximum issues/comments per minute (maxIssuesPerMinute)"
const maxIssuesPerHourLabel = "Maximum issues/comments per hour (maxIssuesPerHour)"
const title = "Account settings"

interface SettingsProps extends CommonPropsType {
  user?: UserType;
}

const Settings = ({
  user: user0,
  loggedInUser,
}: SettingsProps) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const { setLoggedInUserEffectiveImage } = React.useContext(AppContext)
  const username = user0.username
  const [userInfo, setUserInfo] = React.useState(lodash.pick(
    user0,
    [
      'displayName',
      'email',
      'emailNotifications',
      'hideArticleDates',
      'password',
    ]
  ))
  const canSetEmail = !cant.setUserEmail(loggedInUser, user0)
  const needsEmailVerification = !loggedInUser.admin
  const [emailState, setEmailState] = React.useState({ email: user0.email, pendingEmail: user0.pendingEmail, waitMs: user0.emailChangeWaitMs || 0 })
  const [emailWaitMs, setEmailWaitMs] = React.useState(emailState.waitMs)
  const [emailSending, setEmailSending] = React.useState(false)
  const [emailActionError, setEmailActionError] = React.useState('')
  React.useEffect(() => {
    const started = Date.now()
    const update = () => setEmailWaitMs(Math.max(0, emailState.waitMs - (Date.now() - started)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [emailState])
  const emailWaitText = emailWaitMs >= 3600000 ? `${Math.ceil(emailWaitMs / 3600000)}h`
    : emailWaitMs >= 60000 ? `${Math.ceil(emailWaitMs / 60000)}m` : `${Math.ceil(emailWaitMs / 1000)}s`
  const applyEmailState = (user) => {
    setEmailState({ email: user.email, pendingEmail: user.pendingEmail, waitMs: user.emailChangeWaitMs || 0 })
    setUserInfo(state => ({ ...state, email: user.email }))
    setEmailCheck(null)
  }
  const sendEmailChange = async (newEmail?: string) => {
    if (emailSending || isLoading || emailWaitMs > 0) return
    setEmailSending(true)
    setEmailActionError('')
    try {
      const { data, status } = await webApi.userRequestEmailChange(username, newEmail)
      if (status === 200) applyEmailState(data.user)
      else {
        setEmailActionError(typeof data.errors === 'string' ? data.errors : Object.values(data.errors || {}).flat().join(' ') || 'Could not send the verification email.')
        if (status === 429) {
          const current = await webApi.user(username)
          if (current.status === 200) setEmailState({ email: current.data.email, pendingEmail: current.data.pendingEmail, waitMs: current.data.emailChangeWaitMs || 0 })
        }
      }
    } catch {
      setEmailActionError('Could not send the verification email.')
    } finally {
      setEmailSending(false)
    }
  }
  const email = userInfo.email || ''
  const [emailCheck, setEmailCheck] = React.useState<{ email: string; error: string|null }|null>(null)
  const emailUnchanged = email === emailState.email
  const emailError = !email ? 'Email is required.' : emailCheck?.email === email ? emailCheck.error : null
  const checkingEmail = canSetEmail && !!email && !emailUnchanged && emailCheck?.email !== email
  const emailValid = !canSetEmail || (!emailError && !checkingEmail)
  React.useEffect(() => {
    if (!canSetEmail || emailUnchanged || !email) return
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const { data, status } = await webApi.userCheckEmail(username, email)
        const error = status === 200 && data.available === true ? null
          : status === 422 && data.errors
            ? (typeof data.errors === 'string' ? data.errors : Object.values(data.errors).flat().join(' '))
            : 'Could not check this email.'
        if (active) setEmailCheck({ email, error })
      } catch {
        if (active) setEmailCheck({ email, error: 'Could not check this email.' })
      }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [canSetEmail, email, emailUnchanged, username])
  const profileImageRef = React.useRef<HTMLImageElement|null>(null)
  const updateState = (field) => (e) => {
    if (field === 'email') { setEmailCheck(null); setEmailActionError('') }
    const state = userInfo;
    const newState = { ...state, [field]: e.target.value };
    setUserInfo(newState);
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isLoading || emailSending || !emailValid) return
    setLoading(true)
    const user = { ...userInfo }
    if (!user.password) {
      delete user.password
    }
    const { data, status } = await webApi.userUpdate(user0.username, user)
    setLoading(false)
    if (status === 200) {
      if (
        data.user &&
        // Possible for admin edits.
        data.user.username === loggedInUser.username
      ) {
        await setupUserLocalStorage(data.user, setErrors)
      }
      if (needsEmailVerification && data.user.pendingEmail && !emailUnchanged) {
        applyEmailState(data.user)
        return
      }
      Router.push(routes.user(data.user.username))
    } else {
      setErrors(data.errors)
      if (canSetEmail && data.errors?.email) {
        setEmailCheck({ email, error: String(data.errors.email) })
      }
    }
  }

  // Limits.
  const [userInfoLimits, setUserInfoLimits] = React.useState(lodash.pick(
    user0,
    [
      'locked',
      'maxArticles',
      'maxArticleSize',
      'maxUploads',
      'maxUploadSize',
      'maxIssuesPerHour',
      'maxIssuesPerMinute',
    ]
  ))
  const updateStateLimits = (field) => (e) => {
    const state = userInfoLimits
    const newState = { ...state, [field]: e.target.value }
    setUserInfoLimits(newState)
  }
  const handleSubmitLimits = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { data, status } = await webApi.userUpdate(user0.username, userInfoLimits)
    setLoading(false)
    if (status === 200) {
      Router.push(routes.user(data.user.username))
    } else {
      setErrors(data.errors)
    }
  }

  const emailNotificationsForArticleAnnouncementRef = React.useRef(null)
  const cantSetUserLimit = !!cant.setUserLimits(loggedInUser)
  return <>
    <MyHead title={`${title} - ${displayAndUsernameText(userInfo)}`} />
    <div className="settings-page content-not-ourbigbook">
      <h1><SettingsIcon /> {title}</h1>
      <>
        <MapErrors errors={errors} />
        <form onSubmit={handleSubmit}>
          <Label label="Username">
            <input
              type="text"
              disabled={true}
              placeholder="Username"
              value={user0.username}
              title="Cannot be currently modified"
              autoComplete="username"
              //onChange={updateState("username")}
            />
          </Label>
          <Label label="Display name">
            <input
              type="text"
              placeholder="Display name"
              value={userInfo.displayName}
              onChange={updateState("displayName")}
            />
          </Label>
          <Label label="Profile picture">
            <span
              className="profile-picture-container"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = allowedImageContentTypesArr.join(',')
                input.onchange = e => { 
                  var file = (e.target as HTMLInputElement).files[0]
                  if (file.size > profilePictureMaxUploadSize) {
                    alert(`File too large: ${addCommasToInteger(file.size)} bytes. Maximum allowed size: ${formatNumberApprox(profilePictureMaxUploadSize)}B`)
                  } else if (!allowedImageContentTypes.has(file.type)) {
                    alert(`File type not allowed: ${file.type.split('/')[1]}. Allowed types: ${allowedImageContentTypesSimplifiedArr.join(', ')}`)
                  } else {
                    var reader = new FileReader()
                    reader.readAsDataURL(file)
                    reader.onload = async (readerEvent) => {
                      const { data, status } = await webApi.userUpdateProfilePicture(
                        user0.username,
                        readerEvent.target.result,
                      )
                      if (status === 200) {
                        profileImageRef.current.src = data.imageDataUrl
                        if (user0.username === loggedInUser.username) {
                          setLoggedInUserEffectiveImage(data.imageDataUrl)
                        }
                      } else {
                        let msg = `Upload failed with status: ${status}`
                        if (data.errors) {
                          msg += `. Error message: ${data.errors[0]}`
                        }
                        alert(msg)
                      }
                    }
                  }
                }
                input.click()
              }}
            >
              <CustomImage
                className="profile-picture"
                imgRef={profileImageRef}
                src={user0.effectiveImage}
              />
              <span className="profile-picture-caption">Click to update</span>
            </span>
          </Label>
          <Label label={<>Email {canSetEmail && !emailUnchanged && <span role="status" aria-live="polite">
            {emailError ? <span id="email-check-error" className="error-messages"><ErrorIcon /> {emailError}</span>
              : checkingEmail ? 'Checking…' : <OkIcon title="Email available" />}
          </span>}
            {emailState.pendingEmail && <span className="email-change-note">
              {' '}<HelpIcon title="Your current email stays active until you verify the new address." /> Check your new email <b>{emailState.pendingEmail}</b> to verify it.
            </span>}
            {canSetEmail && (emailState.pendingEmail || (needsEmailVerification && !emailUnchanged)) && <span role="status" aria-live="polite">
              {' '}{emailSending ? 'Sending…' : emailWaitMs > 0 ? `You can send a new email in ${emailWaitText}.`
                : <button type="button" disabled={isLoading || (!emailUnchanged && !emailValid)}
                    onClick={() => sendEmailChange(emailUnchanged ? undefined : email)}>
                    {emailUnchanged ? 'Re-send' : 'Send verification'}
                  </button>}
            </span>}
            {emailActionError && <span className="error-messages" role="alert"> <ErrorIcon /> {emailActionError}</span>}
          </>}>
            <input
              type="email"
              placeholder="Email"
              value={userInfo.email}
              onChange={updateState("email")}
              required
              disabled={!canSetEmail}
              title={!canSetEmail ? 'You cannot change this email address' : undefined}
              aria-invalid={!!emailError}
              aria-describedby={canSetEmail && !emailUnchanged && emailError ? 'email-check-error' : undefined}
            />
          </Label>
          <Label label="Password">
            <input
              type="password"
              placeholder="New Password"
              value={userInfoLimits.password}
              onChange={updateState("password")}
              autoComplete="new-password"
            />
          </Label>
          <Label label="Email notifications" inline={true}>
            <input
              type="checkbox"
              defaultChecked={userInfoLimits.emailNotifications}
              onChange={() => {
                setUserInfo((state) => {
                  const newState = !state.emailNotifications
                  const emailNotificationsForArticleAnnouncementElem = emailNotificationsForArticleAnnouncementRef.current
                  if (emailNotificationsForArticleAnnouncementElem) {
                    emailNotificationsForArticleAnnouncementElem.disabled = !newState
                  }
                  return {
                    ...state,
                    emailNotifications: newState
                  }}
                )
              }}
            />
          </Label>
          <Label label="Email notifications for article announcements" inline={true}>
            <input
              type="checkbox"
              defaultChecked={userInfo.emailNotificationsForArticleAnnouncement}
              ref={emailNotificationsForArticleAnnouncementRef}
              onChange={() => setUserInfo((state) => { return {
                ...state,
                emailNotificationsForArticleAnnouncement: !state.emailNotificationsForArticleAnnouncement
              }})}
            />
          </Label>
          <Label
            label="Hide article dates"
            inline={true}
            helpUrl={`${docsUrl}/ourbigbook-web-hide-article-dates`}
          >
            <input
              type="checkbox"
              defaultChecked={userInfo.hideArticleDates}
              onChange={() => setUserInfo((state) => { return {
                ...state,
                hideArticleDates: !state.hideArticleDates
              }})}
            />
          </Label>
          <button
            className="btn"
            type="submit"
            disabled={isLoading || emailSending || !emailValid || (needsEmailVerification && !emailUnchanged && emailWaitMs > 0)}
          >
            <OkIcon /> Update settings
          </button>
        </form>
        <h2><LockIcon /> Limits</h2>
        {cantSetUserLimit &&
          <p>You must <a href={contactUrl}><b>ask an admin</b></a> to change the following limits for you:</p>
        }
        <form onSubmit={handleSubmitLimits}>
          <Label label={maxArticlesLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxArticles}
              onChange={updateStateLimits("maxArticles")}
            />
          </Label>
          <Label label={maxArticleSizeLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxArticleSize}
              onChange={updateStateLimits("maxArticleSize")}
            />
          </Label>
          <Label label={maxUploadsLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxUploads}
              onChange={updateStateLimits("maxUploads")}
            />
          </Label>
          <Label label={maxUploadSizeLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxUploadSize}
              onChange={updateStateLimits("maxUploadSize")}
            />
          </Label>
          <Label label={maxIssuesPerMinuteLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxIssuesPerMinute}
              onChange={updateStateLimits("maxIssuesPerMinute")}
            />
          </Label>
          <Label label={maxIssuesPerHourLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxIssuesPerHour}
              onChange={updateStateLimits("maxIssuesPerHour")}
            />
          </Label>
          <Label
            label="Account locked"
            helpUrl={docsAccountLockingUrl}
            inline={true}
          >
            <input
              disabled={cantSetUserLimit}
              type="checkbox"
              defaultChecked={userInfoLimits.locked}
              onChange={() => setUserInfoLimits((state) => { return {
                ...state,
                locked: !state.locked
              }})}
            />
            {' '}
          </Label>
          <button
            className="btn"
            type="submit"
            disabled={isLoading}
          >
            <OkIcon /> Update limits
          </button>
        </form>
        <h2><HelpIcon /> Extra information</h2>
        <p>Signup IP: <b>{user0.ip || 'not set'}</b></p>
        <p>Nested set needs update (nestedSetNeedsUpdate): <b>{user0.nestedSetNeedsUpdate.toString()}</b></p>
        {loggedInUser.admin &&
          <p>Verified: <b>{user0.verified.toString()}</b></p>
        }
      </>
    </div>
  </>
};

export default Settings;

import { getLoggedInUser } from 'back'
import { cant } from 'front/cant'

export async function getServerSideProps(context) {
  const { params: { uid }, req, res } = context
  if (
    typeof uid === 'string'
  ) {
    const sequelize = req.sequelize
    const [loggedInUser, user] = await Promise.all([
      getLoggedInUser(req, res),
      sequelize.models.User.findOne({
        where: { username: uid },
      }),
    ])
    if (!user) { return { notFound: true } }
    const props: SettingsProps = {}
    if (!loggedInUser) {
      return {
        redirect: {
          destination: routes.userNew(),
          permanent: false,
        }
      }
    }
    if (cant.viewUserSettings(loggedInUser, user)) {
      return { notFound: true }
    } else {
      ;[props.user, props.loggedInUser] = await Promise.all([
        user.toJson(loggedInUser),
        loggedInUser.toJson(loggedInUser),
      ])
    }
    return { props }
  } else {
    return { notFound: true }
  }
}
