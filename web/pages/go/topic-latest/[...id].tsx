import { getStaticPathsTopic, makeGetStaticPropsTopic } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getStaticPaths = getStaticPathsTopic
export const getStaticProps = makeGetStaticPropsTopic('latest')
export default TopicPage
