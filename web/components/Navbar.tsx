import Link from "next/link";
import { useRouter } from "next/router";

import CustomImage from "components/CustomImage";
import CustomLink from "components/CustomLink";
import Maybe from "components/Maybe";
import { LOGIN_ACTION, REGISTER_ACTION } from "lib"
import { APP_NAME, ABOUT_HREF } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

interface NavLinkProps {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const NavLink = ({ href, onClick, children, className }: NavLinkProps) => {
  const router = useRouter();
  const classes = ['nav-link']
  if (encodeURIComponent(router.asPath) === encodeURIComponent(href)) {
    classes.push('active')
  }
  if (className) {
    classes.push(...className.split(' '))
  }
  return (
    <Link href={href} passHref>
      <a
        onClick={onClick}
        className={classes.join(' ')}
      >
        {children}
      </a>
    </Link>
  );
};

const Navbar = () => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  return (
    <nav className="navbar">
      <CustomLink href={routes.home()} className="navbar-brand">
        {APP_NAME}
      </CustomLink>
      <a href={ABOUT_HREF}>About this website</a>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href={routes.articleNew()}>
            <i className="ion-compose" />
            &nbsp;New
          </NavLink>
          <NavLink
            href={routes.userView(loggedInUser?.username)}
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
            {LOGIN_ACTION}
          </NavLink>
          <NavLink href={routes.userNew()}>
            {REGISTER_ACTION}
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
