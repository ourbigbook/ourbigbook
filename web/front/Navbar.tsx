import Link from 'next/link'
import { useRouter } from 'next/router'

import CustomImage from 'front/CustomImage'
import CustomLink from 'front/CustomLink'
import Maybe from 'front/Maybe'
import { LOGIN_ACTION, REGISTER_ACTION, HelpIcon, HomeIcon, NewArticleIcon } from 'front'
import { appName, appNameShort, aboutUrl, donateUrl } from 'front/config'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'

interface NavLinkProps {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  newTab?: boolean
}

const NavLink = ({ href, onClick, children, className, newTab=false }: NavLinkProps) => {
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
    <CustomLink {...{
      href,
      onClick,
      className: classes.join(' '),
      newTab,
    }} >
      {children}
    </CustomLink>
  );
};

const Navbar = ({ isEditor }) => {
  const loggedInUser = useLoggedInUser()
  const router = useRouter();
  return (
    <nav className="navbar">
      <CustomLink href={routes.home()} className="navbar-brand" newTab={isEditor}>
        <CustomImage src="/logo.svg" className="logo"/>
        {appNameShort}
        <span className="beta mobile-hide">
          .com&nbsp;(beta)
        </span>
      </CustomLink>
      <a href={aboutUrl} className="about" target={ isEditor ? '_blank' : '_self' }><HelpIcon />&nbsp;About us</a>
      <a href={donateUrl} className="donate" target={ isEditor ? '_blank' : '_self' }>$ Donate</a>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href={routes.articleNew()} newTab={isEditor}>
            <NewArticleIcon />
            &nbsp;New
          </NavLink>
          <NavLink
            href={routes.user(loggedInUser?.username)}
            className="profile"
            newTab={isEditor}
          >
            <HomeIcon /><span className="home">Home</span>
            <CustomImage
              className="profile-thumb"
              src={loggedInUser?.effectiveImage}
            />
          </NavLink>
        </Maybe>
        <Maybe test={!loggedInUser}>
          <NavLink href={routes.userLogin()} className="login" newTab={isEditor}>
            {LOGIN_ACTION}
          </NavLink>
          <NavLink href={routes.userNew()} className="signup" newTab={isEditor}>
            {REGISTER_ACTION}
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
