import Router from 'next/router'
import React from 'react'

import {
  allowedImageContentTypes,
  allowedImageContentTypesSimplifiedArr,
  contactUrl,
  profilePicturePath,
  profilePictureMaxUploadSize,
} from 'front/config'
import CustomImage from 'front/CustomImage'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  addCommasToInteger,
  MyHead,
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

interface SettingsProps extends CommonPropsType {
  user?: UserType;
}

const Settings = ({
  user: user0,
  loggedInUser,
}: SettingsProps) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [userInfo, setUserInfo] = React.useState(user0);
  const profileImageRef = React.useRef<HTMLImageElement|null>(null)
  const updateState = (field) => (e) => {
    const state = userInfo;
    const newState = { ...state, [field]: e.target.value };
    setUserInfo(newState);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const user = { ...userInfo };
    if (!user.password) {
      delete user.password;
    }
    const { data, status } = await webApi.userUpdate(user.username, user)
    setLoading(false);
    if (status === 200) {
      if (
        data.user &&
        // Possible for admin edits.
        data.user.username === loggedInUser.username
      ) {
        await setupUserLocalStorage(data.user, setErrors)
      }
      Router.push(routes.user(data.user.username));
    } else {
      setErrors(data.errors);
    }
  };
  useCtrlEnterSubmit(handleSubmit)
  const maxArticleSizeLabel = "Maximum number of articles, issues and comments (maxArticles)"
  const maxArticlesLabel = "Maximum article/issue/comment size (maxArticleSize)"
  const maxIssuesPerMinuteLabel = "Maximum issues/comments per minute (maxIssuesPerMinute)"
  const maxIssuesPerHourLabel = "Maximum issues/comments per hour (maxIssuesPerHour)"
  const title = "Account settings"
  const emailNotificationsForArticleAnnouncementRef = React.useRef(null)
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
              value={userInfo.username}
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
                        userInfo.username,
                        readerEvent.target.result,
                      )
                      if (status === 200) {
                        profileImageRef.current.src = `${profilePicturePath}/${userInfo.id}`
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
                src={userInfo.effectiveImage}
              />
              <span className="profile-picture-caption">Click to update</span>
            </span>
          </Label>
          <Label label="Email">
            <input
              type="email"
              placeholder="Email"
              value={userInfo.email}
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
              value={userInfo.password}
              onChange={updateState("password")}
              autoComplete="new-password"
            />
          </Label>
          <Label label="Email notifications" inline={true}>
            <input
              type="checkbox"
              defaultChecked={userInfo.emailNotifications}
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
            Update Settings
          </button>
          <h2>Extra information</h2>
          {cant.setUserLimits(loggedInUser)
            ? <>
                <p><b>Limits:</b></p>
                <ul>
                  <li>{maxArticleSizeLabel}: <b>{userInfo.maxArticleSize}</b></li>
                  <li>{maxArticlesLabel}: <b>{userInfo.maxArticles}</b></li>
                  <li>{maxIssuesPerMinuteLabel}: <b>{userInfo.maxIssuesPerMinute}</b></li>
                  <li>{maxIssuesPerHourLabel}: <b>{userInfo.maxIssuesPerHour}</b></li>
                  {userInfo.nextAnnounceAllowedAt &&
                    <li>Next article announce allowed at: <b>{userInfo.nextAnnounceAllowedAt}</b></li>
                  }
                </ul>
                <div>You may <a href={contactUrl}><b>ask an admin</b></a> to raise any of those limits for you.</div>
              </>
            : <>
                <Label label={maxArticlesLabel}>
                  <input
                    type="number"
                    value={userInfo.maxArticleSize}
                    onChange={updateState("maxArticleSize")}
                  />
                </Label>
                <Label label={maxArticleSizeLabel}>
                  <input
                    type="number"
                    value={userInfo.maxArticles}
                    onChange={updateState("maxArticles")}
                  />
                </Label>
                <Label label={maxIssuesPerMinuteLabel}>
                  <input
                    type="number"
                    value={userInfo.maxIssuesPerMinute}
                    onChange={updateState("maxIssuesPerMinute")}
                  />
                </Label>
                <Label label={maxIssuesPerHourLabel}>
                  <input
                    type="number"
                    value={userInfo.maxIssuesPerHour}
                    onChange={updateState("maxIssuesPerHour")}
                  />
                </Label>
              </>
          }
          <p>Signup IP: <b>{userInfo.ip || 'not set'}</b></p>
          <p>nestedSetNeedsUpdate: <b>{userInfo.nestedSetNeedsUpdate.toString()}</b></p>
          {loggedInUser.admin &&
            <p>Verified: <b>{userInfo.verified.toString()}</b></p>
          }
        </form>
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
