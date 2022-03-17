import { getServerSidePropsTopicHoc } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getServerSideProps = getServerSidePropsTopicHoc('top')
export default TopicPage
