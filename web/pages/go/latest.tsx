import Home from 'front/IndexPage'
export default Home;
import { makeGetStaticPropsHome } from 'back/IndexPage'
export const getStaticProps = makeGetStaticPropsHome('latest')
