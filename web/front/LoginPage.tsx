import Head from 'next/head'
import Label from 'front/Label'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LoginForm from 'front/LoginForm'
import routes from 'front/routes'
import {
  LOGIN_ACTION,
  REGISTER_ACTION,
  UserIcon,
} from 'front'
import { AppContext } from 'front'

const LoginPageHoc = ({ register = false }) => {
  const action = register ? REGISTER_ACTION : LOGIN_ACTION
  return () => {
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => setTitle(action), [action])
    return (
      <div className="auth-page content-not-ourbigbook">
        <h1 className="text-xs-center"><UserIcon /> {action}</h1>
        <CustomLink href={register ? routes.userLogin() : routes.userNew()} >
          {`${register ? `Already have an account? ${LOGIN_ACTION} here.` : `Don't have an account? ${REGISTER_ACTION} here.` }`}
        </CustomLink>
        <LoginForm register={register} />
      </div>
    )
  }
}

export default LoginPageHoc;
