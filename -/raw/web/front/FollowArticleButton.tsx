import { webApi } from 'front/api'
import FollowButton from 'front/FollowButton'

const FollowArticleButton = ({
  article,
  classNames = undefined,
  loggedInUser,
  issueArticle = undefined,
  isIssue = false,
  showText,
  text = undefined,
}) => {
  let follow
  let unfollow
  if (isIssue) {
    follow = async () => webApi.issueFollow(issueArticle.slug, article.number)
    unfollow = async () => webApi.issueUnfollow(issueArticle.slug, article.number)
  } else {
    follow = async () => webApi.articleFollow(article.slug)
    unfollow = async () => webApi.articleUnfollow(article.slug)
  }
  return <FollowButton {...{
    classNames,
    follow,
    followerCount: article.followerCount,
    following: article.followed,
    followText: 'subscribe',
    loggedInUser,
    unfollow,
    showText,
    text,
  }} />
};

export default FollowArticleButton;
