import Home from 'front/IndexPage'
export default Home;
import { getStaticPathsHome, makeGetServerSidePropsIndex } from 'back/IndexPage'
export const getStaticPaths = getStaticPathsHome
export const getServerSideProps = makeGetServerSidePropsIndex('top-followed')
