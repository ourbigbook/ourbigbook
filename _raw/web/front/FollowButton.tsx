import React from 'react'
import Router from 'next/router'

import { buttonActiveClass } from 'front/config'
import routes from 'front/routes'
import {
  FollowIcon,
  UnfollowIcon,
  capitalize,
} from 'front'

const FollowButton = ({
  classNames = undefined,
  loggedInUser,
  follow,
  followText = 'follow',
  following,
  followerCount,
  unfollow,
  showText,
  text = undefined,
}) => {
  const [_following, setFollowing] = React.useState(following)
  const [_followerCount, setFollowerCount] = React.useState(followerCount)
  const handleClick = async (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      Router.push(routes.userNew());
      return;
    }
    setFollowing((_following) => !_following)
    setFollowerCount((_followerCount) => _followerCount + (_following ? - 1 : 1))
    let ret
    if (_following) {
      ret = await unfollow();
    } else {
      ret = await follow();
    }
    const { status, data } = ret
    if (status !== 200) {
      alert(`error: ${status} ${data}`)
      setFollowing((_following) => !_following)
      setFollowerCount((_followerCount) => _followerCount + (_following ? 1 : -1))
    }
  };
  const _classNames = ['modal']
  if (_following) {
    _classNames.push(buttonActiveClass)
  }
  if (classNames) {
    _classNames.push(...classNames)
  }
  let className
  if (_classNames.length) {
    className = _classNames.join(' ')
  } else {
    className = ''
  }
  return (
    <button
      className={className}
      onClick={handleClick}
    >
      {_following ? <UnfollowIcon /> : <FollowIcon />}
      {" "}
      {_following ? `Un${followText}` : capitalize(followText)}{showText ? ` ${text}` : ''}
      {" "}
      ({ _followerCount })
    </button>
  );
};

export default FollowButton;
