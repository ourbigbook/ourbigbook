import { getStaticPathsProfile, getStaticPropsProfile } from "lib/profile"
import ProfileHoc from "components/profile/Profile"
export const getStaticPaths = getStaticPathsProfile
export const getStaticProps = getStaticPropsProfile
const Profile = ProfileHoc('my-posts')
export default Profile
