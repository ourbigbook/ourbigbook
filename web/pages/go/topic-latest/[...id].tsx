import { getStaticPathsTopic, makeGetStaticPropsTopic } from "lib/topic"
import { TopicPage } from "components/TopicPage"
export const getStaticPaths = getStaticPathsTopic
export const getStaticProps = makeGetStaticPropsTopic('latest')
export default TopicPage
