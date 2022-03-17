import Home from 'front/IndexPage'
export default Home;
import { getServerSidePropsIndexHoc } from 'back/IndexPage'
export const getServerSideProps = getServerSidePropsIndexHoc('latest-followed')
