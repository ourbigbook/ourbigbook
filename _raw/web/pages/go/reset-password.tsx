import Router from 'next/router'
import React, { useRef } from 'react'

import ErrorList from 'front/ErrorList'
import Label from 'front/Label'
import MapErrors from 'front/MapErrors'
import {
  MyHead,
  OkIcon,
  RecaptchaScript,
  UserIcon,
  disableButton,
  enableButton,
  getRecaptchaToken,
  useCtrlEnterSubmit,
} from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { SiteType } from 'front/types/SiteType'

interface SiteSettingsProps extends CommonPropsType {
  site: SiteType
}

export default function ResetPasswordPage({
  site,
}: SiteSettingsProps) {
  const [email, setEmail] = React.useState('')
  let emailErrors, emailOks
  if (email) {
    emailErrors = []
    emailOks = ['Valid']
  } else {
    emailErrors = ['Cannot be empty']
    emailOks = []
  }
  const [errors, setErrors] = React.useState([])
  const handleSubmit = async (e) => {
    if (emailErrors.length !== 0) {
      return
    }
    e.preventDefault()
    const recaptchaToken = await getRecaptchaToken()
    const { data, status } = await webApi.resetPasswordRequest(email, recaptchaToken)
    if (status === 200) {
      Router.push(routes.resetPasswordSent())
    } else {
      setErrors(data.errors)
    }
  }
  useCtrlEnterSubmit(handleSubmit)
  const title = 'Reset password'
  const submitElem = useRef(null)
  if (submitElem.current) {
    if (emailErrors.length === 0) {
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
        <Label label="Email or username">
          <input
            type="text"
            onChange={async (e) => {
              setEmail(e.target.value)
            }}
          />
        </Label>
        <ErrorList
          errors={emailErrors}
          oks={emailOks}
        />
        <button
          className="btn"
          type="submit"
          ref={submitElem}
        >
          <OkIcon /> Reset password
        </button>
      </form>
    </div>
    <RecaptchaScript />
  </>
}

import { getLoggedInUser } from 'back'

export async function getServerSideProps(context) {
  const { req, res } = context
  const sequelize = req.sequelize
  const [loggedInUser, site] = await Promise.all([
    getLoggedInUser(req, res),
    sequelize.models.Site.findOne(),
  ])
  const [siteJson, loggedInUserJson] = await Promise.all([
    site.toJson(loggedInUser),
    loggedInUser ? loggedInUser.toJson(loggedInUser) : null,
  ])
  return {
    props: {
      loggedInUser: loggedInUserJson,
      site: siteJson,
    }
  }
}
