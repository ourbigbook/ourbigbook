import styled from "@emotion/styled";
import React from "react";
import useSWR from "swr";

import CustomLink from "./CustomLink";
import Maybe from "./Maybe";
import NavLink from "./NavLink";
import { usePageDispatch } from "lib/context/PageContext";
import checkLogin from "lib/utils/checkLogin";
import { APP_NAME } from "lib/utils/constant";
import storage from "lib/utils/storage";
import * as styles from "../../styles";

const NavbarContainer = styled("nav")`
  ${styles.nav};
  &::after {
    content: "";
    display: table;
    clear: both;
  }
`;

const Logo = styled(CustomLink)`
`;

const NavbarList = styled("div")`
  float: right;
  list-style: none;
`;

const Navbar = () => {
  const setPage = usePageDispatch();
  const { data: currentUser } = useSWR("user", storage);
  const isLoggedIn = checkLogin(currentUser);
  const handleClick = React.useCallback(() => setPage(0), []);
  return (
    <NavbarContainer>
      <Logo href="/" as="/" onClick={handleClick}>
        {APP_NAME}
      </Logo>
      <NavbarList>
        <Maybe test={isLoggedIn}>
          <NavLink href="/editor/new" as="/editor/new">
            <i className="ion-compose" />
            &nbsp;New Post
          </NavLink>
          <NavLink href="/user/settings" as="/user/settings">
            <i className="ion-gear-a" />
            &nbsp;Settings
          </NavLink>
          <NavLink
            href={`/profile/${currentUser?.username}`}
            as={`/profile/${currentUser?.username}`}
            onClick={handleClick}
          >
            {currentUser?.username}
          </NavLink>
        </Maybe>
        <Maybe test={!isLoggedIn}>
          <NavLink href="/user/login" as="/user/login">
            Sign in
          </NavLink>
          <NavLink href="/user/register" as="/user/register">
            Sign up
          </NavLink>
        </Maybe>
      </NavbarList>
    </NavbarContainer>
  );
};

export default Navbar;
