import Router from 'next/router'
import React from 'react'
import Script from 'next/script'

import { LOGIN_ACTION, REGISTER_ACTION, useCtrlEnterSubmit, setCookie, setupUserLocalStorage } from 'front'
import { AppContext } from 'front'
import config from 'front/config'
import MapErrors from 'front/MapErrors'
import Label from 'front/Label'
import { webApi } from 'front/api'
import routes from 'front/routes'

const LoginForm = ({ register = false }) => {
  const [isLoading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState([]);
  const { prevPageNoSignup } = React.useContext(AppContext)
  let email, setEmail;
  let displayName, setDisplayName;
  if (register) {
    [email, setEmail] = React.useState("");
    [displayName, setDisplayName] = React.useState("");
  }
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  let handleEmailChange, handleDisplayNameChange;
  if (register) {
    handleEmailChange = React.useCallback(
      (e) => setEmail(e.target.value),
      []
    );
    handleDisplayNameChange = React.useCallback(
      (e) => setDisplayName(e.target.value),
      []
    );
  }
  const handleUsernameChange = React.useCallback(
    (e) => setUsername(e.target.value),
    []
  );
  const handlePasswordChange = React.useCallback(
    (e) => setPassword(e.target.value),
    []
  );
  const useCaptcha = register && config.useCaptcha
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    let recaptchaToken
    if (useCaptcha) {
      recaptchaToken = await new Promise((resolve, reject) => {
        grecaptcha.ready(function() {
          grecaptcha.execute(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY, {action: 'submit'}).then(function(token) {
            resolve(token)
          });
        });
      })
    }
    try {
      let data, status;
      if (register) {
        ({ data, status } = await webApi.userCreate({ displayName, username, email, password }, recaptchaToken));
        if (status === 200) {
          Router.push(routes.userVerify(data.user.email))
        }
      } else {
        ({ data, status } = await webApi.userLogin({ username, password }));
        if (status === 200) {
          if (data.verified) {
            if (data.user) {
              await setupUserLocalStorage(data.user, setErrors)
              // Can't simply user Router.back() here because our default redirection pattern now
              // is page -> signup -> signin, so after signin user goes back to signup, making it
              // feel like the signin failed.
              //Router.back()
              Router.push(prevPageNoSignup ? prevPageNoSignup : routes.home())
            }
          } else {
            Router.push(routes.userVerify(data.user.email))
          }
        }
      }
      if (status !== 200 && data.errors) {
        setErrors(data.errors);
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
      <MapErrors errors={errors} />
      <form onSubmit={handleSubmit}>
        {register &&
          <Label label="Display name">
            <input
              autoComplete="name"
              type="text"
              placeholder="John Smith"
              value={displayName}
              onChange={handleDisplayNameChange}
            />
          </Label>
        }
        <Label label={ register ? "Username (cannot be modified later)" : "Username or email" }>
          <input
            autoComplete="username"
            type="text"
            placeholder="a-z, 0-9, '-', e.g.: john-smith, johnsmith123"
            value={username}
            onChange={handleUsernameChange}
          />
        </Label>
        {register &&
          <Label label="Email">
            <input
              autoComplete="email"
              type="email"
              placeholder="john.smith@mail.com"
              value={email}
              onChange={handleEmailChange}
            />
          </Label>
        }
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
      {useCaptcha &&
        <Script src={`https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`} />
      }
    </>
  );
};

export default LoginForm;
