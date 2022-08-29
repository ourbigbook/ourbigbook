import Router from 'next/router'

import { logout } from 'front'

const LogoutButton = () => {
  const handleLogout = async (e) => {
    e.preventDefault()
    logout()
    Router.push(`/`)
  };
  return (
    <button className="btn" onClick={handleLogout}><i className="ion-log-out"></i> Logout</button>
  );
};

export default LogoutButton;
