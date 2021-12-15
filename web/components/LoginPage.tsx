import Head from "next/head";
import Label from "components/Label";
import React from "react";

import CustomLink from "components/CustomLink";
import LoginForm from "components/LoginForm";
import routes from "routes";
import { LOGIN_ACTION, REGISTER_ACTION } from "lib";
import { AppContext } from 'lib'

const makeLoginPage = ({ register = false }) => {
  const action = register ? REGISTER_ACTION : LOGIN_ACTION
  return () => {
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => setTitle(action), [action])
    return (
      <div className="auth-page content-not-cirodown">
        <h1 className="text-xs-center">{action}</h1>
        <CustomLink href={register ? routes.userLogin() : routes.userNew()} >
          {`${register ? `Already have an account? ${LOGIN_ACTION} here.` : `Don't have an account? ${REGISTER_ACTION} here.` }`}
        </CustomLink>
        <LoginForm register={register} />
      </div>
    )
  }
}

export default makeLoginPage;
