const checkLogin = (loggedInUser) =>
  !!loggedInUser &&
  loggedInUser?.constructor === Object &&
  Object.keys(loggedInUser).length !== 0;

export default checkLogin;
