import Router from 'next/router'
import { mutate } from 'swr'

import { AUTH_LOCAL_STORAGE_NAME, deleteCookie } from 'front'
import { AUTH_COOKIE_NAME } from 'front/js'

const LogoutButton = () => {
  const handleLogout = async (e) => {
    e.preventDefault();
    window.localStorage.removeItem(AUTH_LOCAL_STORAGE_NAME);
    deleteCookie(AUTH_COOKIE_NAME)
    mutate('user', null);
    Router.push(`/`)
  };
  return (
    <button className="btn" onClick={handleLogout}><i className="ion-log-out"></i> Logout</button>
  );
};

export default LogoutButton;
