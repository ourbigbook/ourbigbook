import LoginPageHoc from 'front/LoginPage'
export default LoginPageHoc({})
import { getServerSidePropsLoginPageHoc } from 'back/LoginPage'
export const getServerSideProps = getServerSidePropsLoginPageHoc()
