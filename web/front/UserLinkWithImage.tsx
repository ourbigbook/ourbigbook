/* A link to a user profile that includes a small profile picture. */

import CustomImage from 'front/CustomImage'
import { DisplayAndUsername, DisplayAndUsernameProps, UserLink } from 'front/user'

export const UserLinkWithImageInner = ({
  user, showScore, showUsername, showUsernameMobile
}: DisplayAndUsernameProps) => {
  if (!user) return null;
  return (
    <>
      <CustomImage
        src={user.effectiveImage}
        className="profile-thumb"
      />
      {' '}
      <DisplayAndUsername {...{
          showScore,
          showUsername,
          showUsernameMobile,
          user,
        }}
      />
    </>
  )
}

const UserLinkWithImage = ({
  user, showScore, showUsername, showUsernameMobile
}: DisplayAndUsernameProps) => {
  if (!user) return null;
  return (
    <UserLink user={user}>
      <UserLinkWithImageInner {...{
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
