import LoginPageHoc from 'front/LoginPage'
export default LoginPageHoc({ register: true });
import { getServerSidePropsLoginPageHoc } from 'back/LoginPage'
export const getServerSideProps = getServerSidePropsLoginPageHoc({ register: true })
