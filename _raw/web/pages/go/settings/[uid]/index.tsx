import Router from 'next/router'
import React from 'react'

import lodash from 'lodash'

import {
  allowedImageContentTypes,
  allowedImageContentTypesSimplifiedArr,
  contactUrl,
  docsAccountLockingUrl,
  profilePicturePath,
  profilePictureMaxUploadSize,
} from 'front/config'
import CustomImage from 'front/CustomImage'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  addCommasToInteger,
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

const maxArticleSizeLabel = "Maximum number of articles, issues and comments (maxArticles)"
const maxArticlesLabel = "Maximum article/issue/comment size (maxArticleSize)"
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
  const username = user0.username
  const [userInfo, setUserInfo] = React.useState(lodash.pick(
    user0,
    [
      'displayName',
      'emailNotifications',
      'hideArticleDates',
      'password',
    ]
  ))
  const profileImageRef = React.useRef<HTMLImageElement|null>(null)
  const updateState = (field) => (e) => {
    const state = userInfo;
    const newState = { ...state, [field]: e.target.value };
    setUserInfo(newState);
  }
  const handleSubmit = async (e) => {
    e.preventDefault()
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
      Router.push(routes.user(data.user.username))
    } else {
      setErrors(data.errors)
    }
  }
  useCtrlEnterSubmit(handleSubmit)

  // Limits.
  const [userInfoLimits, setUserInfoLimits] = React.useState(lodash.pick(
    user0,
    [
      'locked',
      'maxArticleSize',
      'maxArticles',
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
                        profileImageRef.current.src = `${profilePicturePath}/${user0.id}`
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
          <Label label="Email">
            <input
              type="email"
              placeholder="Email"
              value={user0.email}
              onChange={updateState("email")}
              // https://github.com/ourbigbook/ourbigbook/issues/268
              disabled={true}
              title="Cannot be currently modified"
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
          <Label label="Hide article dates" inline={true}>
            <input
              type="checkbox"
              defaultChecked={userInfo.hideArticleDates}
              title="Hardcode the created and updated date of every edited or created article to January 1st 1970. That fake date is stored in the database instead of the real dates which are lost forever. Sequential IDs are still stored in the database, which would allos for a subpoena to infer dates from nearby ID ranges."
              onChange={() => setUserInfo((state) => { return {
                ...state,
                hideArticleDates: !state.hideArticleDates
              }})}
            />
          </Label>
          <button
            className="btn"
            type="submit"
            disabled={isLoading}
          >
            <OkIcon /> Update settings
          </button>
        </form>
        <h2><LockIcon /> Limits</h2>
        <p>You must <a href={contactUrl}><b>ask an admin</b></a> to change the following limits for you:</p>
        <form onSubmit={handleSubmitLimits}>
          <Label label={maxArticlesLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxArticleSize}
              onChange={updateStateLimits("maxArticleSize")}
            />
          </Label>
          <Label label={maxArticleSizeLabel}>
            <input
              disabled={cantSetUserLimit}
              type="number"
              value={userInfoLimits.maxArticles}
              onChange={updateStateLimits("maxArticles")}
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
            helpUrl={`${docsAccountLockingUrl}/account-locking`}
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
import { formatDate } from 'front/date'

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
