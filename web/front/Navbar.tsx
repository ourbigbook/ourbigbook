import Link from 'next/link'
import { useRouter } from 'next/router'

import CustomImage from 'front/CustomImage'
import CustomLink from 'front/CustomLink'
import Maybe from 'front/Maybe'
import { LOGIN_ACTION, REGISTER_ACTION, NewArticleIcon } from 'front'
import { appName, aboutUrl } from 'front/config'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'

interface NavLinkProps {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const NavLink = ({ href, onClick, children, className }: NavLinkProps) => {
  const router = useRouter();
  const classes = ['nav-link']
  // This would mark toplevel nav items as selected or not. But it doesn't make
  // much sense on current toplevel nav configuration.
  //if (encodeURIComponent(router.asPath) === encodeURIComponent(href)) {
  //  classes.push('active')
  //}
  if (className) {
    classes.push(...className.split(' '))
  }
  return (
    <CustomLink
      href={href}
      onClick={onClick}
      className={classes.join(' ')}
    >
      {children}
    </CustomLink>
  );
};

const Navbar = () => {
  const loggedInUser = useLoggedInUser()
  const router = useRouter();
  return (
    <nav className="navbar">
      <CustomLink href={routes.home()} className="navbar-brand">
        <CustomImage src="/logo.svg" className="logo"/>
        {appName}
      </CustomLink>
      <a href={aboutUrl} className="about">About us</a>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href={routes.articleNew()}>
            <NewArticleIcon />
            &nbsp;New
          </NavLink>
          <NavLink
            href={routes.user(loggedInUser?.username)}
            className="profile"
          >
            {loggedInUser?.username}
          </NavLink>
        </Maybe>
        <Maybe test={!loggedInUser}>
          <NavLink href={routes.userLogin()} className="login">
            {LOGIN_ACTION}
          </NavLink>
          <NavLink href={routes.userNew()} className="signup">
            {REGISTER_ACTION}
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
