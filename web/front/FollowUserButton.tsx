import React from 'react'
import { mutate } from 'swr'
import Router from 'next/router'

import UserAPI from 'front/api/user'
import { buttonActiveClass } from 'front/config'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'

const FollowUserButton = ({
  user,
  showUsername,
}) => {
  const loggedInUser = useLoggedInUser()
  const [following, setFollowing] = React.useState(user.following)
  const [followerCount, setFollowerCount] = React.useState(user.followerCount)
  const { username } = user;
  const isCurrentUser = loggedInUser && username === loggedInUser?.username;
  const handleClick = (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    setFollowing(!following)
    setFollowerCount(followerCount + (following ? - 1 : 1))
    try {
      if (following) {
        UserAPI.unfollow(username);
      } else {
        UserAPI.follow(username);
      }
    } catch (error) {
      setFollowing(!following)
      setFollowerCount(followerCount + (following ? 1 : -1))
    }
  };
  return (
    <button
      className={following ? buttonActiveClass : ''}
      onClick={handleClick}
    >
      <i className={ "ion-eye" + (following ? '-disabled' : '') } />
      {" "}
      {following ? "Unfollow" : "Follow"}{showUsername ? ` ${username}` : ''}
      {" "}
      ({ followerCount })
    </button>
  );
};

export default FollowUserButton;
