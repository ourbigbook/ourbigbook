import Router from 'next/router'
import React, { useRef } from 'react'

import ErrorList from 'front/ErrorList'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  disableButton,
  enableButton,
  MyHead,
  UserIcon,
  useCtrlEnterSubmit,
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'

interface ResetPasswordProps extends CommonPropsType {
  code?: string;
  email?: string;
}

export default function ResetPasswordPage({
  code,
  email,
}: ResetPasswordProps) {
  let passwordOks
  let passwordErrors
  let passwordConfirmOks
  let passwordConfirmErrors
  const [errors, setErrors] = React.useState([])
  const [password, setPassword] = React.useState('')
  const [passwordConfirm, setPasswordConfirm] = React.useState('')
  if (password) {
    passwordErrors = []
    passwordOks = ['Valid']
  } else {
    passwordErrors = ['Cannot be empty']
    passwordOks = []
  }
  if (password === passwordConfirm) {
    passwordConfirmOks = ['Passwords match']
    passwordConfirmErrors = []
  } else {
    passwordConfirmOks = []
    passwordConfirmErrors = [`Passwords don't match`]

  }
  const handleSubmit = async (e) => {
    e.preventDefault()
    const { data, status } = await webApi.resetPassword(email, password, code)
    if (status === 200) {
      Router.push(routes.userLogin())
    } else {
      setErrors(data.errors)
    }
  }
  useCtrlEnterSubmit(handleSubmit)
  const title = 'Reset password'
  const submitElem = useRef(null)
  if (submitElem.current) {
    if (passwordErrors.length === 0 && passwordConfirmErrors.length === 0) {
      enableButton(submitElem.current)
    } else {
      disableButton(submitElem.current)
    }
  }
  return <>
    <MyHead title={title} />
    <div className="reset-password-page content-not-ourbigbook">
      <h1><UserIcon /> {title}</h1>
      <MapErrors errors={errors} />
      <form onSubmit={handleSubmit}>
        <Label label="Password">
          <input
            type="password"
            onChange={e => setPassword(e.target.value)}
          />
        </Label>
        <ErrorList
          errors={passwordErrors}
          oks={passwordOks}
        />
        <Label label="Confirm password">
          <input
            type="password"
            onChange={e => setPasswordConfirm(e.target.value)}
          />
        </Label>
        <ErrorList
          errors={passwordConfirmErrors}
          oks={passwordConfirmOks}
        />
        <button
          className="btn"
          type="submit"
          ref={submitElem}
        >
          Update password
        </button>
      </form>
    </div>
  </>
}

import { getLoggedInUser } from 'back'

export const getServerSideProps = async function getServerSidePropsResetPassword({ params = {}, req, res }) {
  const email = req.query.email
  const code = req.query.code
  const loggedInUser = await  getLoggedInUser(req, res)
  const props: ResetPasswordProps = {
    email,
    code,
  }
  if (loggedInUser) {
    props.loggedInUser = await loggedInUser.toJson(loggedInUser)
  }
  return { props }
}
