import Head from "next/head";

import CustomLink from "components/common/CustomLink";
import RegisterForm from "components/profile/RegisterForm";

const Register = () => (
  <>
    <Head>
      <title>Register</title>
    </Head>
    <div className="auth-page content-not-cirodown">
      <h1 className="text-xs-center">Sign Up</h1>
      <p className="text-xs-center">
        <CustomLink href="/user/login" as="/user/login">
          Have an account?
        </CustomLink>
      </p>

      <RegisterForm />
    </div>
  </>
);

export default Register;
