import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import ListErrors from "components/common/ListErrors";
import Label from "components/common/Label";
import UserAPI from "lib/api/user";

const RegisterForm = () => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const handleUsernameChange = React.useCallback(
    (e) => setUsername(e.target.value),
    []
  );
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
      const { data, status } = await UserAPI.register(
        username,
        email,
        password
      );
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
        <Label label="Username">
          <input
            className="form-control form-control-lg"
            type="text"
            placeholder="Username"
            value={username}
            onChange={handleUsernameChange}
          />
        </Label>
        <Label label="Email">
          <input
            className="form-control form-control-lg"
            type="email"
            placeholder="Email"
            value={email}
            onChange={handleEmailChange}
          />
        </Label>
        <Label label="Password">
          <input
            className="form-control form-control-lg"
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
          Sign up
        </button>
      </form>
    </>
  );
};

export default RegisterForm;
