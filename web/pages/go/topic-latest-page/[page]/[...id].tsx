import { getServerSidePropsTopicHoc } from 'back/TopicPage'
import { TopicPage } from 'front/TopicPage'
export const getStaticPaths = getStaticPathsTopic
export const getServerSideProps = getServerSidePropsTopicHoc('latest')
export default TopicPage
