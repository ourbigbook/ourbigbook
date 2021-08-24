import { getStaticPathsTopic, getStaticPropsTopic, TopicHoc } from "lib/topic"
export const getStaticPaths = getStaticPathsTopic
export const getStaticProps = getStaticPropsTopic
const Topic = TopicHoc('articles')
export default Topic
