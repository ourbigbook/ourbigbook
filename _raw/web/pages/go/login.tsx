import LoginPageHoc from 'front/LoginPage'
export default LoginPageHoc({})
import { getServerSidePropsLoginPage } from 'back/LoginPage'
export const getServerSideProps = getServerSidePropsLoginPage
