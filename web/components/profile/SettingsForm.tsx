import axios from "axios";
import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import Label from "components/common/Label";
import ListErrors from "components/common/ListErrors";
import UserAPI from "lib/api/user";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import storage from "lib/utils/storage";
import routes from "routes";

const SettingsForm = () => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [userInfo, setUserInfo] = React.useState({
    image: "",
    username: "",
    bio: "",
    email: "",
    password: "",
  });
  const loggedInUser = getLoggedInUser()
  React.useEffect(() => {
    if (!loggedInUser) return;
    setUserInfo({ ...userInfo, ...loggedInUser });
  }, [loggedInUser]);
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
  return (
    <React.Fragment>
      <ListErrors errors={errors} />
      <form onSubmit={submitForm}>
        <Label label="Profile picture">
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
        <Label label="Bio">
          <textarea
            rows={8}
            placeholder="Short bio about you"
            value={userInfo.bio}
            onChange={updateState("bio")}
            className="not-monaco"
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
    </React.Fragment>
  );
};

export default SettingsForm;
