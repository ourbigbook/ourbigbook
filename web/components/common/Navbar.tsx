import React from "react";
import Link from "next/link";

import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import NavLink from "components/common/NavLink";
import { APP_NAME } from "lib/utils/constant";
import { usePageDispatch } from "lib/context/PageContext";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const Navbar = () => {
  const setPage = usePageDispatch();
  const loggedInUser = getLoggedInUser()
  const handleClick = React.useCallback(() => setPage(0), []);
  return (
    <nav className="navbar">
      <CustomLink href="/" as="/" onClick={handleClick} className="navbar-brand">
        {APP_NAME}
      </CustomLink>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href="/editor" as="/editor">
            <i className="ion-compose" />
            &nbsp;New
          </NavLink>
          <NavLink
            href={`/profile/${loggedInUser?.username}`}
            as={`/profile/${loggedInUser?.username}`}
            onClick={handleClick}
            className="profile"
          >
            <CustomImage
              className="profile-thumb"
              src={loggedInUser?.effectiveImage}
              alt="your profile image"
            />
            {loggedInUser?.username}
          </NavLink>
        </Maybe>
        <Maybe test={!loggedInUser}>
          <NavLink href="/user/login" as="/user/login">
            Sign in
          </NavLink>
          <NavLink href="/user/register" as="/user/register">
            Sign up
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
