import React from "react";

import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";

interface EditProfileButtonProps {
  isCurrentUser: boolean;
}

const EditProfileButton = ({ isCurrentUser }: EditProfileButtonProps) => (
  <Maybe test={isCurrentUser}>
    <CustomLink
      href="/settings"
      className="btn btn-sm btn-outline-secondary action-btn"
    >
      <i className="ion-gear-a" /> Edit Profile Settings
    </CustomLink>
  </Maybe>
);

export default EditProfileButton;
