import { makeGetStaticPropsTopic } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getStaticProps = makeGetStaticPropsTopic('latest')
export default TopicPage
