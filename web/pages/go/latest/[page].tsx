import Home from 'components/Home'
export default Home;
import { getStaticPathsHome, makeGetStaticPropsHome } from 'lib/home'
export const getStaticPaths = getStaticPathsHome
export const getStaticProps = makeGetStaticPropsHome('latest')
