import Home from 'front/IndexPage'
export default Home;
import { makeGetServerSidePropsIndex } from 'back/IndexPage'
export const getServerSideProps = makeGetServerSidePropsIndex('latest-followed')
