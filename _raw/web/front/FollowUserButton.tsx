import { webApi } from 'front/api'
import FollowButton from 'front/FollowButton'

const FollowUserButton = ({
  loggedInUser,
  user,
  showUsername,
}) => {
  const username = user.username
  return <FollowButton {...{
    follow: () => webApi.userFollow(username),
    followerCount: user.followerCount,
    following: user.following,
    loggedInUser,
    showText: showUsername,
    text: username,
    unfollow: () => webApi.userUnfollow(username),
  }} />
};

export default FollowUserButton;
