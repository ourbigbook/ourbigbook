import React from 'react'
import Router from 'next/router'

import useLoggedInUser from 'front/useLoggedInUser'
import { AppContext, setupUserLocalStorage } from 'front'
import routes from 'front/routes'

function VerifyPage({ code, email, user, verificationOk }) {
  const { setTitle } = React.useContext(AppContext)
  const loggedInUser = useLoggedInUser()
  if (loggedInUser) {
    Router.push(routes.home())
  }
  React.useEffect(async () => {
    setTitle('Verify your account')
    if (verificationOk) {
      await setupUserLocalStorage(user)
      Router.push(routes.home())
    }
  })
  return (
    <div className="verify-page content-not-ourbigbook">
      <h1>Verify your account.</h1>
      {!code &&
        <div>Click the verification link we've sent to your email: {email} to verify your account.</div>
      }
      {verificationOk &&
        <div>Verification done, you are now being redirected.</div>
      }
      {(code && email && !verificationOk) &&
        <div>Verification code invalid. TODO give user something to do about it, e.g. resend.</div>
      }
    </div>
  )
}

export default VerifyPage

import { MyGetServerSideProps } from 'front/types'

export const getServerSideProps = async ({ params = {}, req, res }) => {
  const email = req.query.email
  const code = req.query.code
  let props = {}
  if (email) {
    props.email = email
    if (code) {
      const user = await req.sequelize.models.User.findOne({ where: { email }})
      let verificationOk
      if (user.verificationCode === code) {
        user.token = user.generateJWT()
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
