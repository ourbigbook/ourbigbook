import Home from 'components/Home'
export default Home;
import { makeGetStaticPropsHome } from 'lib/home'
export const getStaticProps = makeGetStaticPropsHome('latest')
