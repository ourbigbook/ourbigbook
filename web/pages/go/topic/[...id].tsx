import { makeGetServerSidePropsTopic } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getServerSideProps = makeGetServerSidePropsTopic('top')
export default TopicPage
