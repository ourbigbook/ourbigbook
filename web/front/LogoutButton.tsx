import Router from 'next/router'
import { mutate, trigger } from 'swr'

import { deleteCookie } from 'front'

const LogoutButton = () => {
  const handleLogout = async (e) => {
    e.preventDefault();
    window.localStorage.removeItem("user");
    deleteCookie('auth')
    mutate("user", null);
    Router.push(`/`).then(() => trigger("user"));
  };
  return (
    <button className="btn" onClick={handleLogout}><i className="ion-log-out"></i> Logout</button>
  );
};

export default LogoutButton;
