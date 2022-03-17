import { makeGetServerSidePropsTopic } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getStaticPaths = getStaticPathsTopic
export const getServerSideProps = makeGetServerSidePropsTopic('latest')
export default TopicPage
