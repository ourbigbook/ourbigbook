import Home from 'front/IndexPage'
export default Home;
import { getStaticPathsHome, makeGetStaticPropsHome } from 'back/IndexPage'
export const getStaticPaths = getStaticPathsHome
export const getStaticProps = makeGetStaticPropsHome('top-followed')
