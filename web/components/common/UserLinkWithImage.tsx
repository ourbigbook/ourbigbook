/* A link to a user profile that includes a small profile picture. */

import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import { Author } from "lib/types/articleType";

const UserLinkWithImage = ({ user }: { user: Author }) => {
  if (!user) return null;
  return (
    <CustomLink
      href={`/profile/${encodeURIComponent(user.username)}`}
      className="author username"
    >
      <CustomImage
        src={user.image}
        className="profile-thumb"
        alt="author profile image"
      />
      &nbsp;
      {user.username}
    </CustomLink>
  )
}

export default UserLinkWithImage;
