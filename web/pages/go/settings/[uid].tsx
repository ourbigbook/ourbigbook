import Router from 'next/router'
import React from 'react'

import { contactUrl } from 'front/config'
import Label from 'front/Label'
import ListErrors from 'front/ListErrors'
import LogoutButton from 'front/LogoutButton'
import { AppContext, setupUserLocalStorage, useCtrlEnterSubmit } from 'front'
import { webApi } from 'front/api'
import checkLogin from 'front/checkLogin'
import storage from 'front/storage'
import routes from 'front/routes'
import { UserType } from 'front/types/UserType'

interface SettingsProps {
  loggedInUser?: UserType;
  user?: UserType;
}

const Settings = ({
  user: user0,
  loggedInUser,
}) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [userInfo, setUserInfo] = React.useState(user0);
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
    if (status !== 200) {
      setErrors(data.errors.body);
    }
    if (
      data.user &&
      // Possible for admin edits.
      data.user.username === loggedInUser.username
    ) {
      await setupUserLocalStorage(data.user, setErrors)
    }
    Router.push(routes.user(data.user.username));
  };
  useCtrlEnterSubmit(handleSubmit)
  const maxArticleSizeLabel = "Maximum number of article pages, issues and comments (maxArticles)"
  const maxArticlesLabel = "Maximum article/issue/comment size (maxArticleSize)"
  const title = 'Account settings'
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => { setTitle(title) }, [])
  return (
    <div className="settings-page content-not-ourbigbook">
      <h1>{title}</h1>
      <LogoutButton />
      <>
        <ListErrors errors={errors} />
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
          <Label label="UserPage picture">
            <input
              type="text"
              placeholder="URL of profile picture"
              value={userInfo.image ? userInfo.image : ""}
              onChange={updateState("image")}
            />
          </Label>
          <Label label="Email">
            <input
              type="email"
              placeholder="Email"
              value={userInfo.email}
              onChange={updateState("email")}
              // https://github.com/cirosantilli/ourbigbook/issues/268
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
          <button
            className="btn"
            type="submit"
            disabled={isLoading}
          >
            Update Settings
          </button>
          <h2>Extra information</h2>
          <p>Signup IP: {userInfo.ip || 'not set'}</p>
          {cant.setUserLimits(loggedInUser)
            ? <>
                <p>Limits:</p>
                <ul>
                  <li>{maxArticleSizeLabel}: {userInfo.maxArticleSize}</li>
                  <li>{maxArticlesLabel}: {userInfo.maxArticles}</li>
                </ul>
                <div>You may <a href={contactUrl}>ask an admin</a> to raise any of those limits for you.</div>
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
              </>
            }
        </form>
      </>
    </div>
  );
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
    throw new TypeError
  }
}
