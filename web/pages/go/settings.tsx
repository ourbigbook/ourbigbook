import Router from 'next/router'
import React from 'react'
import { mutate } from 'swr'

import Label from 'components/Label'
import ListErrors from 'components/ListErrors'
import LogoutButton from 'components/LogoutButton'
import { AppContext } from 'lib'
import UserAPI from 'lib/api/user'
import checkLogin from 'lib/utils/checkLogin'
import getLoggedInUser from 'lib/utils/getLoggedInUser'
import storage from 'lib/utils/storage'
import routes from 'routes'

const Settings = () => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [userInfo, setUserInfo] = React.useState({
    image: "",
    username: "",
    displayName: "",
    bio: "",
    email: "",
    password: "",
  });
  const loggedInUser = getLoggedInUser()
  React.useEffect(() => {
    if (!loggedInUser) return;
    setUserInfo({ ...userInfo, ...loggedInUser });
  }, [loggedInUser]);
  React.useEffect(() => {
    storage("user").then(loggedInUser => {
      const isLoggedIn = checkLogin(loggedInUser);
      if (!isLoggedIn) {
        Router.push(`/`);
      }
    })
  })
  const updateState = (field) => (e) => {
    const state = userInfo;
    const newState = { ...state, [field]: e.target.value };
    setUserInfo(newState);
  };
  const submitForm = async (e) => {
    e.preventDefault();
    setLoading(true);
    const user = { ...userInfo };
    if (!user.password) {
      delete user.password;
    }
    const { data, status } = await UserAPI.update(user, loggedInUser?.token)
    setLoading(false);
    if (status !== 200) {
      setErrors(data.errors.body);
    }
    if (data?.user) {
      data.user.token = (await storage('user')).token
      window.localStorage.setItem("user", JSON.stringify(data.user));
      mutate("user", data.user);
      Router.push(routes.userView(user.username));
    }
  };
  const title = 'Account settings'
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => { setTitle(title) }, [])
  return (
    <div className="settings-page content-not-cirodown">
      <h1>{title}</h1>
      <LogoutButton />
      <>
        <ListErrors errors={errors} />
        <form onSubmit={submitForm}>
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
          <Label label="Bio">
            <textarea
              rows={8}
              placeholder="Short bio about you"
              value={userInfo.bio}
              onChange={updateState("bio")}
              className="not-monaco"
            />
          </Label>
          <Label label="Username">
            <input
              type="text"
              placeholder="Username"
              value={userInfo.username}
              onChange={updateState("username")}
            />
          </Label>
          <Label label="Email">
            <input
              type="email"
              placeholder="Email"
              value={userInfo.email}
              onChange={updateState("email")}
            />
          </Label>
          <Label label="Password">
            <input
              type="password"
              placeholder="New Password"
              value={userInfo.password}
              onChange={updateState("password")}
            />
          </Label>
          <button
            className="btn"
            type="submit"
            disabled={isLoading}
          >
            Update Settings
          </button>
        </form>
      </>
    </div>
  );
};

export default Settings;
