import Router from 'next/router'
import React from 'react'

import Label from 'front/Label'
import ListErrors from 'front/ListErrors'
import LogoutButton from 'front/LogoutButton'
import { AppContext, setupUserLocalStorage, useCtrlEnterSubmit } from 'front'
import { UserApi } from 'front/api'
import checkLogin from 'front/checkLogin'
import useLoggedInUser from 'front/useLoggedInUser'
import storage from 'front/storage'
import routes from 'front/routes'

const Settings = () => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [userInfo, setUserInfo] = React.useState({
    image: "",
    username: "",
    displayName: "",
    email: "",
    password: "",
  });
  const loggedInUser = useLoggedInUser()
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
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const user = { ...userInfo };
    if (!user.password) {
      delete user.password;
    }
    const { data, status } = await UserApi.update(user)
    setLoading(false);
    if (status !== 200) {
      setErrors(data.errors.body);
    }
    if (data?.user) {
      await setupUserLocalStorage(data, setErrors)
    }
  };
  useCtrlEnterSubmit(handleSubmit)
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
