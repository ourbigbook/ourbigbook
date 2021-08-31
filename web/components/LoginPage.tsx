import Head from "next/head";
import Label from "components/Label";

import CustomLink from "components/CustomLink";
import LoginForm from "components/LoginForm";
import routes from "routes";

const makeLoginPage = ({ register = false }) => {
  return () => (
    <>
      <Head>
        <title>{register ? 'Register' : 'Login'}</title>
        <title>Login</title>
      </Head>
      <div className="auth-page content-not-cirodown">
        <h1 className="text-xs-center">
          {register
            ? <>Sign up</>
            : <>Sign in</>
          }
        </h1>
        <CustomLink href={register ? routes.userLogin() : routes.userNew()} >
          {`${register ? 'Have' : 'Need' }`} an account?
        </CustomLink>
        <LoginForm register={register} />
      </div>
    </>
  );
}

export default makeLoginPage;
