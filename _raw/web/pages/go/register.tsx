import LoginPageHoc from 'front/LoginPage'
export default LoginPageHoc({ register: true });
import { getServerSidePropsLoginPage } from 'back/LoginPage'
export const getServerSideProps = getServerSidePropsLoginPage
