import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import ListErrors from "components/ListErrors";
import Label from "components/Label";
import { LOGIN_ACTION, REGISTER_ACTION } from "lib";
import UserAPI from "lib/api/user";

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
        window.localStorage.setItem("user", JSON.stringify(data.user));
        mutate("user", data.user);
        Router.push("/");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
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
            type="email"
            placeholder="Email"
            value={email}
            onChange={handleEmailChange}
          />
        </Label>
        <Label label="Password">
          <input
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
