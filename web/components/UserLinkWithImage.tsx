/* A link to a user profile that includes a small profile picture. */

import CustomLink from "components/CustomLink";
import CustomImage from "components/CustomImage";
import { User } from "lib/types/userType";
import routes from "routes";
import { DisplayAndUsername } from "front/user"

const UserLinkWithImage = ({ user }: { user: User }) => {
  if (!user) return null;
  return (
    <CustomLink
      href={routes.userView(user.username)}
      className="author username"
    >
      <CustomImage
        src={user.effectiveImage}
        className="profile-thumb"
        alt="author profile image"
      />
      {' '}
      <DisplayAndUsername user={user}></DisplayAndUsername>
    </CustomLink>
  )
}

export default UserLinkWithImage;
