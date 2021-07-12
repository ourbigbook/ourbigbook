import axios from "axios";
import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import Label from "components/common/Label";
import ListErrors from "components/common/ListErrors";
import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

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
    const { data, status } = await axios.put(
      `${SERVER_BASE_URL}/user`,
      JSON.stringify({ user }),
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${loggedInUser?.token}`,
        },
      }
    );
    setLoading(false);
    if (status !== 200) {
      setErrors(data.errors.body);
    }
    if (data?.user) {
      if (data.user?.image) {
        data.user.effectiveImage = data.user.image;
      }
      window.localStorage.setItem("user", JSON.stringify(data.user));
      mutate("user", data.user);
      Router.push(`/profile/${user.username}`);
    }
  };
  return (
    <React.Fragment>
      <ListErrors errors={errors} />
      <form onSubmit={submitForm}>
        <Label label="Profile picture">
          <input
            className="form-control"
            type="text"
            placeholder="URL of profile picture"
            value={userInfo.image}
            onChange={updateState("image")}
          />
        </Label>
        <Label label="Username">
          <input
            className="form-control form-control-lg"
            type="text"
            placeholder="Username"
            value={userInfo.username}
            onChange={updateState("username")}
          />
        </Label>
        <Label label="Bio">
          <textarea
            className="form-control form-control-lg"
            rows={8}
            placeholder="Short bio about you"
            value={userInfo.bio}
            onChange={updateState("bio")}
          />
        </Label>
        <Label label="Email">
          <input
            className="form-control form-control-lg"
            type="email"
            placeholder="Email"
            value={userInfo.email}
            onChange={updateState("email")}
          />
        </Label>
        <Label label="Password">
          <input
            className="form-control form-control-lg"
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
