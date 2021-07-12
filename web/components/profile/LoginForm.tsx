import Router from "next/router";
import React from "react";
import { mutate } from "swr";

import ListErrors from "components/common/ListErrors";
import Label from "components/common/Label";
import UserAPI from "lib/api/user";

const LoginForm = () => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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
      const { data, status } = await UserAPI.login(email, password);
      if (status !== 200) {
        setErrors(data.errors);
      }
      if (data?.user) {
        const { data: profileData, status: profileStatus } = await UserAPI.get(data.user.username);
        if (profileStatus !== 200) {
          setErrors(profileData.errors);
        }
        data.user.effectiveImage = profileData.profile.image;
        window.localStorage.setItem("user", JSON.stringify(data.user));
        mutate("user", data?.user);
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
        <Label label="Email">
          <input
            className="form-control form-control-lg"
            type="email"
            placeholder="Email"
            value={email}
            onChange={handleEmailChange}
          />
        </Label>
        <Label label="Email">
          <input
            className="form-control form-control-lg"
            type="password"
            placeholder="Password"
            value={password}
            onChange={handlePasswordChange}
          />
        </Label>
        <button
          className="btn btn-lg btn-primary pull-xs-right"
          type="submit"
          disabled={isLoading}
        >
          Sign in
        </button>
      </form>
    </>
  );
};

export default LoginForm;
