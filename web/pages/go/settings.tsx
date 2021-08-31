import Router from "next/router";
import React from "react";
import { trigger } from "swr";

import LogoutButton from "components/LogoutButton";
import SettingsForm from "components/SettingsForm";
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
  return (
    <div className="settings-page content-not-cirodown">
      <h1>Your Settings</h1>
      <LogoutButton />
      <SettingsForm />
    </div>
  );
};

export default Settings;
