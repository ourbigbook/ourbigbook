import Router from 'next/router'

import {
  LogoutIcon,
  logout
} from 'front'

const LogoutButton = () => {
  const handleLogout = async (e) => {
    e.preventDefault()
    logout()
    Router.push(`/`)
  };
  return (
    <button className="btn" onClick={handleLogout}><LogoutIcon /> Logout</button>
  );
};

export default LogoutButton;
