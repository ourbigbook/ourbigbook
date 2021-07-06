import React from "react";
import Link from "next/link";

import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import NavLink from "components/common/NavLink";
import { usePageDispatch } from "lib/context/PageContext";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const NavbarItem = ({ children }) => (
  <li className="nav-item">{children}</li>
)

const Navbar = () => {
  const setPage = usePageDispatch();
  const loggedInUser = getLoggedInUser()
  const handleClick = React.useCallback(() => setPage(0), []);
  return (
    <nav className="navbar navbar-light">
      <div className="container">
        <CustomLink href="/" as="/" onClick={handleClick} className="navbar-brand">
          conduit
        </CustomLink>
        <ul className="nav navbar-nav pull-xs-right">
          <NavbarItem>
            <NavLink href="/" as="/" onClick={handleClick}>
              Home
            </NavLink>
          </NavbarItem>
          <Maybe test={loggedInUser}>
            <NavbarItem>
              <NavLink href="/editor" as="/editor">
                <i className="ion-compose" />
                &nbsp;New Article
              </NavLink>
            </NavbarItem>
            <NavbarItem>
              <NavLink href="/settings" as="/settings">
                <i className="ion-gear-a" />
                &nbsp;Settings
              </NavLink>
            </NavbarItem>
            <NavbarItem>
              <NavLink
                href={`/profile/${loggedInUser?.username}`}
                as={`/profile/${loggedInUser?.username}`}
                onClick={handleClick}
              >
                <CustomImage
                  className="user-pic"
                  src={loggedInUser?.effectiveImage}
                  alt="Comment author's profile image"
                />
                {loggedInUser?.username}
              </NavLink>
            </NavbarItem>
          </Maybe>
          <Maybe test={!loggedInUser}>
            <NavbarItem>
              <NavLink href="/user/login" as="/user/login">
                Sign in
              </NavLink>
            </NavbarItem>
            <NavbarItem>
              <NavLink href="/user/register" as="/user/register">
                Sign up
              </NavLink>
            </NavbarItem>
          </Maybe>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
