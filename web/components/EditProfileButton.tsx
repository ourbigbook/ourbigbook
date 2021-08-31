import React from "react";

import CustomLink from "components/CustomLink";
import Maybe from "components/Maybe";
import routes from "routes";

interface EditProfileButtonProps {
  isCurrentUser: boolean;
}

const EditProfileButton = ({ isCurrentUser }: EditProfileButtonProps) => (
  <Maybe test={isCurrentUser}>
    <CustomLink
      href={routes.userEdit()}
      className="btn btn-sm btn-outline-secondary action-btn"
    >
      <i className="ion-gear-a" /> Edit Profile Settings
    </CustomLink>
  </Maybe>
);

export default EditProfileButton;
