import React from 'react'
import Router from 'next/router'
import Link from 'next/link'

import { MyHead, setupUserLocalStorage } from 'front'
import routes from 'front/routes'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { UserType } from 'front/types/UserType'

export interface VerifyPageProps extends CommonPropsType {
  code?: string;
  email?: string;
  user?: UserType;
  verificationOk?: boolean;
  emailChangeUsername?: string;
}

export default function VerifyPage({
  code,
  email,
  user,
  verificationOk,
  emailChangeUsername,
  loggedInUser,
} : VerifyPageProps) {
  React.useEffect(() => {
    if (verificationOk && !emailChangeUsername) {
      setupUserLocalStorage(user).then(() => Router.push(routes.home()))
    }
  })
  if (emailChangeUsername) {
    const title = 'Verify your email address'
    return <>
      <MyHead title={title} />
      <div className="verify-page content-not-ourbigbook">
        <h1>{title}</h1>
        <p>{verificationOk ? 'Your email address has been updated.'
          : 'This link is invalid, has already been used, or the email address is no longer available. Request a new link from Settings.'}</p>
        <Link href={loggedInUser?.username === emailChangeUsername ? routes.userEdit(emailChangeUsername) : routes.userLogin()}>
          {loggedInUser?.username === emailChangeUsername ? 'Return to Settings' : 'Sign in'}
        </Link>
      </div>
    </>
  }
  const title = 'Verify your account'
  return <>
    <MyHead title={title} />
    <div className="verify-page content-not-ourbigbook">
      <h1>{title}</h1>
      {!code &&
        <>
          <p>Click the verification link we've sent to your email: <b>{email}</b> to verify your account.</p>
          <p>Also check your spam box if you can't see the email.</p>
        </>
      }
      {verificationOk &&
        <p>Verification done, you are now being redirected.</p>
      }
      {(code && email && !verificationOk) &&
        <p>Verification code invalid. TODO give user something to do about it, e.g. resend.</p>
      }
      {!verificationOk &&
        <p>To re-send this email, simply <Link href={routes.userNew()}>register again with the same email</Link>.</p>
      }
    </div>
  </>
}

import { getLoggedInUser } from 'back'

export const getServerSideProps = async function getServerSidePropsVerifyPage({ params = {}, req, res }) {
  const loggedInUser = await getLoggedInUser(req, res)
  const emailChangeUsername = req.query.emailChange
  if (typeof emailChangeUsername === 'string' && emailChangeUsername) {
    res.setHeader('Cache-Control', 'no-store')
    const props: VerifyPageProps = {
      emailChangeUsername,
      verificationOk: await req.sequelize.models.User.verifyEmailChange(emailChangeUsername, req.query.code),
    }
    if (loggedInUser) props.loggedInUser = await loggedInUser.toJson(loggedInUser)
    return { props }
  }
  if (loggedInUser) {
    return {
      redirect: {
        destination: routes.home(),
        permanent: false,
      }
    }
  }
  const props: VerifyPageProps = {}
  const email = req.query.email
  if (email) {
    props.email = email
    const code = req.query.code
    if (code) {
      const user = await req.sequelize.models.User.findOne({ where: { email }})
      let verificationOk
      if (user.verificationCode === code) {
        user.token = user.generateJWT()
        user.verified = true
        user.verificationCode = null
        user.verificationCodeN = 0
        await user.save()
        verificationOk = true
      } else {
        verificationOk = false
      }
      props.code = code
      props.verificationOk = verificationOk
      props.user = await user.toJson(user)
    }
  }
  return { props }
}
