import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import ListErrors from "components/common/ListErrors";
import Label from "components/common/Label";
import UserAPI from "lib/api/user";

const LoginForm = ({ register = false }) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  let username, setUsername;
  if (register) {
    [username, setUsername] = React.useState("");
  }
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  let handleUsernameChange;
  if (register) {
    handleUsernameChange = React.useCallback(
      (e) => setUsername(e.target.value),
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
        ({ data, status } = await UserAPI.register(username, email, password));
      } else {
        ({ data, status } = await UserAPI.login(email, password));
      }
      if (status !== 200 && data?.errors) {
        setErrors(data.errors);
      }
      if (data?.user) {
        // We fetch from /profiles/:username again because the return from /users/login above
        // does not contain the image placeholder.
        const { data: profileData, status: profileStatus } = await UserAPI.get(data.user.username);
        if (profileStatus !== 200) {
          setErrors(profileData.errors);
        }
        data.user.effectiveImage = profileData.profile.image;
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
          <Label label="Username">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={handleUsernameChange}
            />
          </Label>
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
          {`${register ? 'Sign up' : 'Sign in'}`}
        </button>
      </form>
    </>
  );
};

export default LoginForm;
