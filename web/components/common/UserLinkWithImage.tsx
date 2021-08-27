/* A link to a user profile that includes a small profile picture. */

import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import { User } from "lib/types/userType";
import routes from "routes";

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
      &nbsp;
      {user.username}
    </CustomLink>
  )
}

export default UserLinkWithImage;
