import React from 'react'
import Router from 'next/router'

import useLoggedInUser from 'front/useLoggedInUser'
import { MyHead, setupUserLocalStorage } from 'front'
import routes from 'front/routes'
import { UserType } from 'front/types/UserType'

export interface VerifyPageProps {
  code?: string;
  email?: string;
  user?: UserType;
  verificationOk?: boolean;
}

function VerifyPage({ code, email, user, verificationOk } : VerifyPageProps) {
  const loggedInUser = useLoggedInUser()
  if (loggedInUser) {
    Router.push(routes.home())
  }
  React.useEffect(() => {
    if (verificationOk) {
      setupUserLocalStorage(user).then(() => Router.push(routes.home()))
    }
  })
  const title = 'Verify your account'
  return <>
    <MyHead title={title} />
    <div className="verify-page content-not-ourbigbook">
      <h1>{title}</h1>
      {!code &&
        <>
          <p>Click the verification link we've sent to your email: {email} to verify your account.</p>
          <p>Also check your spam box if you can't see the email.</p>
        </>
      }
      {verificationOk &&
        <p>Verification done, you are now being redirected.</p>
      }
      {(code && email && !verificationOk) &&
        <p>Verification code invalid. TODO give user something to do about it, e.g. resend.</p>
      }
    </div>
  </>
}

export default VerifyPage

export const getServerSideProps = async ({ params = {}, req, res }) => {
  const email = req.query.email
  const code = req.query.code
  let props: VerifyPageProps = {}
  if (email) {
    props.email = email
    if (code) {
      const user = await req.sequelize.models.User.findOne({ where: { email }})
      let verificationOk
      if (user.verificationCode === code) {
        user.token = user.generateJWT()
        user.verified = true
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
