import React from 'react'
import Link from 'next/link'

import { ipBlockedForSignupMessage } from 'front/js'
import LoginForm from 'front/LoginForm'
import routes from 'front/routes'
import {
  HelpIcon,
  LOGIN_ACTION,
  MyHead,
  REGISTER_ACTION,
  UserIcon,
} from 'front'

import { CommonPropsType } from 'front/types/CommonPropsType'

export interface LoginPageProps extends CommonPropsType {
  ip: string
  ipBlockPrefix?: string
}

export default function LoginPage({ register = false }) {
  const title = register ? REGISTER_ACTION : LOGIN_ACTION
  return function LoginPage({
    ip,
    ipBlockPrefix
  }: LoginPageProps) {
    return <>
      <MyHead title={title} />
      <div className="auth-page content-not-ourbigbook">
        <h1 className="text-xs-center"><UserIcon /> {title}</h1>
        {(register && ipBlockPrefix)
          ? <p>{ipBlockedForSignupMessage(ip, ipBlockPrefix)}</p>
          : <>
              <LoginForm register={register} />
              <p>
                <Link href={register ? routes.userLogin() : routes.userNew()} >
                  <UserIcon /> {`${register ? `Already have an account? ${LOGIN_ACTION} here.` : `Don't have an account? ${REGISTER_ACTION} here.` }`}
                </Link>
              </p>
              <p><Link href={routes.resetPassword()}><HelpIcon /> Forgot your password? Reset it here.</Link></p>
            </>
        }
      </div>
    </>
  }
}
