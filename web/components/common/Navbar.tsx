import React from "react";
import Link from "next/link";

import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import NavLink from "components/common/NavLink";
import { APP_NAME } from "lib/utils/constant";
import { usePageDispatch } from "lib/context/PageContext";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const Navbar = () => {
  const setPage = usePageDispatch();
  const loggedInUser = getLoggedInUser()
  const handleClick = React.useCallback(() => setPage(0), []);
  return (
    <nav className="navbar">
      <CustomLink href={routes.home()} onClick={handleClick} className="navbar-brand">
        {APP_NAME}
      </CustomLink>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href={routes.articleNew()}>
            <i className="ion-compose" />
            &nbsp;New
          </NavLink>
          <NavLink
            href={routes.userView(loggedInUser?.username)}
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
          <NavLink href={routes.userLogin()}>
            Sign in
          </NavLink>
          <NavLink href={routes.userNew()}>
            Sign up
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
