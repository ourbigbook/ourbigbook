import Router from 'next/router'
import React from 'react'

import {
  LOGIN_ACTION,
  REGISTER_ACTION,
  OkIcon,
  useCtrlEnterSubmit,
  setupUserLocalStorage,
  getRecaptchaToken,
  RecaptchaScript,
} from 'front'
import { AppContext } from 'front'
import MapErrors from 'front/MapErrors'
import Label from 'front/Label'
import { webApi } from 'front/api'
import routes from 'front/routes'

const LoginForm = ({ register = false }) => {
  const [isLoading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState([])
  const { prevPageNoSignup } = React.useContext(AppContext)
  const [email, setEmail] = React.useState("")
  const [displayName, setDisplayName] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const handleEmailChange = React.useCallback((e) => setEmail(e.target.value), [] )
  const handleDisplayNameChange = React.useCallback((e) => setDisplayName(e.target.value), [])
  const handleUsernameChange = React.useCallback((e) => setUsername(e.target.value), [])
  const handlePasswordChange = React.useCallback((e) => setPassword(e.target.value), [])
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let data, status
      if (register) {
        const recaptchaToken = await getRecaptchaToken()
        ;({ data, status } = await webApi.userCreate({ displayName, username, email, password }, recaptchaToken))
        if (status === 200) {
          Router.push(routes.userVerify(data.user.email))
        }
      } else {
        ;({ data, status } = await webApi.userLogin({ username, password }))
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
        setErrors(data.errors)
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
          <OkIcon /> {`${register ? REGISTER_ACTION : LOGIN_ACTION}`}
        </button>
      </form>
      {register && <RecaptchaScript />}
    </>
  )
}

export default LoginForm;
