import Head from "next/head";
import Label from "components/common/Label";

import CustomLink from "components/common/CustomLink";
import LoginForm from "components/profile/LoginForm";

const Login = () => (
  <>
    <Head>
      <title>Login</title>
    </Head>
    <div className="auth-page content-not-cirodown">
      <h1>Sign in</h1>
      <CustomLink href="/user/register" as="/user/register">
        Need an account?
      </CustomLink>
      <LoginForm />
    </div>
  </>
);

export default Login;
