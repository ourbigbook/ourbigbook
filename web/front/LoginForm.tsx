import Router from 'next/router'
import React from 'react'
import { mutate } from 'swr'

import ListErrors from 'front/ListErrors'
import Label from 'front/Label'
import { LOGIN_ACTION, REGISTER_ACTION, useCtrlEnterSubmit, setCookie  } from 'front'
import UserAPI from 'front/api/user'

const LoginForm = ({ register = false }) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  let username, setUsername;
  let displayName, setDisplayName;
  if (register) {
    [username, setUsername] = React.useState("");
    [displayName, setDisplayName] = React.useState("");
  }
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  let handleUsernameChange, handleDisplayNameChange;
  if (register) {
    handleUsernameChange = React.useCallback(
      (e) => setUsername(e.target.value),
      []
    );
    handleDisplayNameChange = React.useCallback(
      (e) => setDisplayName(e.target.value),
      []
    );
  }
  const handleEmailChange = React.useCallback(
    (e) => setEmail(e.target.value),
    []
  );
  const handlePasswordChange = React.useCallback(
    (e) => setPassword(e.target.value),
    []
  );
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let data, status;
      if (register) {
        ({ data, status } = await UserAPI.register(displayName, username, email, password));
      } else {
        ({ data, status } = await UserAPI.login(email, password));
      }
      if (status !== 200 && data?.errors) {
        setErrors(data.errors);
      }
      if (data?.user) {
        // We fetch from /profiles/:username again because the return from /users/login above
        // does not contain the image placeholder.
        const { data: userData, status: userStatus } = await UserAPI.get(
          data.user.username
        )
        if (userStatus !== 200) {
          setErrors(userData.errors)
        }
        data.user.effectiveImage = userData.user.effectiveImage
        window.localStorage.setItem("user", JSON.stringify(data.user));
        setCookie('auth', data.user.token)
        mutate("user", data.user);
        Router.push("/");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  useCtrlEnterSubmit(handleSubmit)
  return (
    <>
      <ListErrors errors={errors} />
      <form onSubmit={handleSubmit}>
        {register &&
          <>
            <Label label="Display name">
              <input
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={handleDisplayNameChange}
              />
            </Label>
            <Label label="Username">
              <input
                autoComplete="username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={handleUsernameChange}
              />
            </Label>
          </>
        }
        <Label label="Email">
          <input
            autoComplete="email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={handleEmailChange}
          />
        </Label>
        <Label label="Password">
          <input
            autoComplete={register ? "new-password" : "current-password"}
            type="password"
            placeholder="Password"
            value={password}
            onChange={handlePasswordChange}
          />
        </Label>
        <button
          className="btn"
          type="submit"
          disabled={isLoading}
        >
          {`${register ? REGISTER_ACTION : LOGIN_ACTION}`}
        </button>
      </form>
    </>
  );
};

export default LoginForm;
