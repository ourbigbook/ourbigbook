import Link from 'next/link'
import { useRouter } from 'next/router'
import React from 'react'

import CustomImage from 'front/CustomImage'
import CustomLink from 'front/CustomLink'
import Maybe from 'front/Maybe'
import {
  HelpIcon,
  HomeIcon,
  LOGIN_ACTION,
  LikeIcon,
  NewArticleIcon,
  NotificationIcon,
  REGISTER_ACTION,
  UserIcon,
} from 'front'
import { appNameShort, aboutUrl, donateUrl } from 'front/config'
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

const Navbar = ({ isEditor, scoreDelta }) => {
  const loggedInUser = useLoggedInUser()
  const router = useRouter();
  const [_scoreDelta, setScoreDelta] = React.useState(scoreDelta)
  React.useEffect(() => {
    setScoreDelta(scoreDelta);
  }, [scoreDelta])
  return (
    <nav className="navbar">
      <div className="brand-group">
        <CustomLink href={routes.home()} className="brand" newTab={isEditor}>
          <CustomImage src="/logo.svg" className="logo"/>
          {appNameShort}
        </CustomLink>
        <a href={aboutUrl} className="about" target={ isEditor ? '_blank' : '_self' }><HelpIcon />&nbsp;About</a>
        <a href={donateUrl} className="donate" target={ isEditor ? '_blank' : '_self' }><span className="icon">$</span>&nbsp;Donate</a>
      </div>
      <div className="navbar-list">
        <Maybe test={loggedInUser}>
          <NavLink href={routes.articleNew()} newTab={isEditor}>
            <NewArticleIcon />
            &nbsp;New
          </NavLink>
          <NavLink
            href={routes.userLiked(loggedInUser?.username)}
            className={`score${ _scoreDelta ? ` changed` : '' }`}
            onClick={() => setScoreDelta(0)}
          >
            <LikeIcon /> +{_scoreDelta}
          </NavLink>
          <NavLink
            href={routes.user(loggedInUser?.username)}
            className="profile"
            newTab={isEditor}
          >
            <CustomImage
              className="profile-thumb"
              src={loggedInUser?.effectiveImage}
            />
            {loggedInUser?.score}<LikeIcon />
          </NavLink>
        </Maybe>
        <Maybe test={!loggedInUser}>
          <NavLink href={routes.userLogin()} className="login" newTab={isEditor}>
            <UserIcon />&nbsp;{LOGIN_ACTION}
          </NavLink>
          <NavLink href={routes.userNew()} className="signup" newTab={isEditor}>
            <NewArticleIcon />&nbsp;{REGISTER_ACTION}
          </NavLink>
        </Maybe>
      </div>
    </nav>
  );
};

export default Navbar;
