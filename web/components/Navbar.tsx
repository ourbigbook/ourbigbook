import CustomImage from "components/CustomImage";
import Maybe from "components/Maybe";
import NavLink from "components/NavLink";
import { LOGIN_ACTION, REGISTER_ACTION } from "lib"
import { APP_NAME } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const Navbar = () => {
  const loggedInUser = getLoggedInUser()
  return (
    <nav className="navbar">
      <a href={routes.home()} className="navbar-brand">
        {APP_NAME}
      </a>
      <a href="https://cirosantilli.com/ourbigbook-com">About this website</a>
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
