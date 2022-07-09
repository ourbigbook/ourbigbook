/* A link to a user profile that includes a small profile picture. */

import CustomImage from 'front/CustomImage'
import { UserType } from 'front/types/UserType'
import { DisplayAndUsername, DisplayAndUsernameProps, UserLink } from 'front/user'

const UserLinkWithImage = ({
  user, showScore, showUsername, showUsernameMobile
}: DisplayAndUsernameProps) => {
  if (!user) return null;
  return (
    <UserLink user={user}>
      <CustomImage
        src={user.effectiveImage}
        className="profile-thumb"
        alt="author profile image"
      />
      {' '}
      <DisplayAndUsername {...{
          showScore,
          showUsername,
          showUsernameMobile,
          user,
        }}
      />
    </UserLink>
  )
}

export default UserLinkWithImage;
