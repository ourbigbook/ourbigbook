import Router from "next/router";
import React from "react";
import { mutate, trigger } from "swr";

import SettingsForm from "components/profile/SettingsForm";
import checkLogin from "lib/utils/checkLogin";
import storage from "lib/utils/storage";

const Settings = () => {
  React.useEffect(() => {
    storage("user").then(loggedInUser => {
      const isLoggedIn = checkLogin(loggedInUser);
      if (!isLoggedIn) {
        Router.push(`/`);
      }
    })
  })
  const handleLogout = async (e) => {
    e.preventDefault();
    window.localStorage.removeItem("user");
    mutate("user", null);
    Router.push(`/`).then(() => trigger("user"));
  };
  return (
    <div className="settings-page content-not-cirodown">
      <h1>Your Settings</h1>
      <button className="btn" onClick={handleLogout}>Logout</button>
      <SettingsForm />
    </div>
  );
};

export default Settings;
