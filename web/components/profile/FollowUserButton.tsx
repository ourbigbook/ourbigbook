import React from "react";
import { mutate } from "swr";
import Router from "next/router";

import UserAPI from "lib/api/user";
import { BUTTON_ACTIVE_CLASS } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

export const FollowUserButtonContext = React.createContext(undefined);

const FollowUserButton = ({
  profile,
  showUsername,
}) => {
  const loggedInUser = getLoggedInUser()
  const {following, setFollowing} = React.useContext(FollowUserButtonContext);
  const { username } = profile;
  const isCurrentUser = loggedInUser && username === loggedInUser?.username;
  const handleClick = (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    if (following) {
      UserAPI.unfollow(username);
    } else {
      UserAPI.follow(username);
    }
    setFollowing(!following)
  };
  return (
    <button
      className={following ? BUTTON_ACTIVE_CLASS : ''}
      onClick={handleClick}
    >
      <i className={ "ion-eye" + (following ? '-disabled' : '') } />
      {" "}
      {following ? "Unfollow" : "Follow"}{showUsername ? ` ${username}` : ''}
      {" "}
      ({ profile.followerCount })
    </button>
  );
};

export default FollowUserButton;
