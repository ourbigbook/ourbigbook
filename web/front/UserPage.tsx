import { useRouter } from 'next/router'
import React from 'react'

import pluralize from 'pluralize'

import {
  ArticleIcon,
  CommentIcon,
  HomeIcon,
  IssueIcon,
  LikeIcon,
  MyHead,
  UserIcon,
  orderToPageTitle,
  useEEdit,
} from 'front'
import ArticleList from 'front/ArticleList'
import CommentList from 'front/CommentList'
import { cant } from 'front/cant'
import config from 'front/config'
import CustomLink from 'front/CustomLink'
import CustomImage from 'front/CustomImage'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import Maybe from 'front/Maybe'
import FollowUserButton from 'front/FollowUserButton'
import { DisplayAndUsername, displayAndUsernameText } from 'front/user'
import routes from 'front/routes'
import Article from 'front/Article'
import { ArticleType, ArticleLinkType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'
import UserList from 'front/UserList'

export interface UserPageProps {
  ancestors?: ArticleLinkType[];
  article?: ArticleType & IssueType;
  articles?: (ArticleType & IssueType & TopicType)[];
  articlesCount?: number;
  articlesInSamePage?: ArticleType[];
  articlesInSamePageForToc?: ArticleType[];
  commentCountByLoggedInUser?: number;
  comments?: CommentType[];
  commentsCount?: number;
  hasUnlisted?: boolean;
  incomingLinks?: ArticleLinkType[];
  issuesCount?: number;
  itemType?: 'article' | 'comment' | 'discussion' | 'like'| 'topic' | 'user';
  latestIssues?: IssueType[];
  list: boolean,
  loggedInUser?: UserType;
  order: string;
  page: number;
  synonymLinks?: ArticleLinkType[];
  tagged?: ArticleLinkType[];
  topIssues?: IssueType[];
  user: UserType;
  users?: UserType[];
  usersCount?: number;
  what:
    'followed' |
    'followed-articles' |
    'followed-discussions' |
    'follows' |
    'home' |
    'liked' |
    'liked-discussions' |
    'likes' |
    'likes-discussions' |
    'user-articles' |
    'user-comments' |
    'user-issues'
  ;
}

export default function UserPage({
  article,
  articles,
  articlesCount,
  articlesInSamePage,
  articlesInSamePageForToc,
  ancestors,
  comments,
  commentsCount,
  commentCountByLoggedInUser,
  hasUnlisted,
  incomingLinks,
  issuesCount,
  itemType,
  latestIssues,
  list,
  loggedInUser,
  order,
  page,
  synonymLinks,
  tagged,
  topIssues,
  user,
  users,
  usersCount,
  what,
}: UserPageProps) {
  const router = useRouter();
  const username = user?.username
  const isCurrentUser = loggedInUser && username === loggedInUser?.username
  const canEdit = loggedInUser && loggedInUser?.username === username
  useEEdit(canEdit, article?.slug)

  // Following state.
  const [following, setFollowing] = React.useState(false)
  const [followerCount, setFollowerCount] = React.useState(user?.followerCount)
  React.useEffect(() => {
    setFollowing(user?.following)
    setFollowerCount(user?.followerCount)
  }, [
    user?.following,
    user?.followerCount,
  ])

  // title
  const displayAndUsername = displayAndUsernameText(user)
  let title2
  switch (what) {
    case 'followed':
      title2 = 'Newly followed by'
      break;
    case 'follows':
      title2 = 'New follows'
      break;
    case 'liked':
      title2 = `New received likes`
      break;
    case 'likes':
    case 'likes-discussions':
      title2 = `Newly liked ${pluralize(itemType)}`
      break;
    case 'followed-articles':
    case 'followed-discussions':
      title2 = `Newly followed ${pluralize(itemType)}`
      break;
    default:
      if (itemType) {
        title2 = `${orderToPageTitle(order)} ${pluralize(itemType)}`
      }
  }
  const title = `${displayAndUsername} ${title2 ? ` - ${title2}` : ''}`

  const handleShortFragmentSkipOnce = React.useRef(false)
  if (router.isFallback) { return <LoadingSpinner />; }
  return <>
    <MyHead title={title} />
    <div className="profile-page">
      <div className="user-info content-not-ourbigbook">
        <div className="name-and-image">
          <div className="no-image">
            <h1>
              <DisplayAndUsername user={user} showParenthesis={false} />
            </h1>
            <div className="user-actions">
              <FollowUserButton {...{ loggedInUser, user, showUsername: false }}/>
              <CustomLink className="btn" href={routes.issueNew(`${user.username}`)}>
                <IssueIcon /> Message
              </CustomLink>
              <Maybe test={!cant.viewUserSettings(loggedInUser, user)}>
                <CustomLink
                  href={routes.userEdit(user.username)}
                  className="btn btn-sm btn-outline-secondary action-btn"
                >
                  <i className="ion-gear-a" /> Settings
                </CustomLink>
              </Maybe>
              {isCurrentUser &&
                <LogoutButton />
              }
              {user.admin && <span className="h2 inline"><i className="ion-star" /> <a href={`${config.docsAdminUrl}`}>Admin</a> <i className="ion-star" /> </span>}
            </div>
          </div>
          <CustomImage
            src={user.effectiveImage}
            alt="User's profile image"
            className="user-img"
          />
        </div>
        <div className="tab-list">
          <CustomLink
            href={routes.user(username)}
            className={`tab-item${what === 'home' ? ' active' : ''}`}
          >
            <HomeIcon /> Home
          </CustomLink>
          <CustomLink
            href={routes.userArticles(username, { sort: 'score' })}
            className={`tab-item${what === 'user-articles' && order === 'score' ? ' active' : ''}`}
          >
            <ArticleIcon /> Top<span className="mobile-hide"> articles</span>
          </CustomLink>
          <CustomLink
            href={routes.userArticles(username, { sort: 'created' })}
            className={`tab-item${what === 'user-articles' && order === 'createdAt' ? ' active' : ''}`}
          >
            <ArticleIcon /> New<span className="mobile-hide"> articles</span>
          </CustomLink>
          <CustomLink
            href={routes.userArticles(username, { sort: 'updated' })}
            className={`tab-item${what === 'user-articles' && order === 'updatedAt' ? ' active' : ''}`}
          >
            <ArticleIcon /> Updated<span className="mobile-hide"> articles</span>
          </CustomLink>
          <CustomLink
            href={routes.userIssues(user.username, { sort: 'created' })}
            className={`tab-item${what === 'user-issues' && order === 'createdAt' ? ' active' : ''}`}
          >
            <IssueIcon /> New<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            href={routes.userIssues(user.username, { sort: 'score' })}
            className={`tab-item${what === 'user-issues' && order === 'score' ? ' active' : ''}`}
          >
            <IssueIcon /> Top<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            href={routes.userComments(user.username, { sort: 'created' })}
            className={`tab-item${what === 'user-comments' && order === 'createdAt' ? ' active' : ''}`}
          >
            <CommentIcon /> New<span className="mobile-hide"> comments</span>
          </CustomLink>
          <CustomLink
            href={routes.userFollows(username)}
            className={`tab-item${what === 'follows' ? ' active' : ''}`}
          >
            <UserIcon /> Follows
          </CustomLink>
          <CustomLink
            href={routes.userFollowed(username)}
            className={`tab-item${what === 'followed' ? ' active' : ''}`}
          >
            <UserIcon /> Followed by
          </CustomLink>
          <CustomLink
            href={routes.userLikes(username)}
            className={`tab-item${what === 'likes' ? ' active' : ''}`}
          >
            <ArticleIcon /> Liked<span className="mobile-hide"> articles</span>
          </CustomLink>
          <CustomLink
            href={routes.userFollowsArticles(username)}
            className={`tab-item${what === 'followed-articles' ? ' active' : ''}`}
          >
            <ArticleIcon /> Followed<span className="mobile-hide"> articles</span>
          </CustomLink>
          <CustomLink
            href={routes.userLikesDiscussions(username)}
            className={`tab-item${what === 'likes-discussions' ? ' active' : ''}`}
          >
            <IssueIcon /> Liked<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            href={routes.userFollowsDiscussions(username)}
            className={`tab-item${what === 'followed-discussions' ? ' active' : ''}`}
          >
            <IssueIcon /> Followed<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            href={routes.userLiked(username)}
            className={`tab-item${what === 'liked' ? ' active' : ''}`}
          >
            <LikeIcon /> Received<span className="mobile-hide"> likes</span>
          </CustomLink>
          {false &&
            // TODO https://github.com/ourbigbook/ourbigbook/issues/313
            <CustomLink
              href={routes.userLikedDiscussions(username)}
              className={`tab-item${what === 'liked-discussions' ? ' active' : ''}`}
            >
              <LikeIcon /><IssueIcon /> Received<span className="mobile-hide"> discussion likes</span>
            </CustomLink>
          }
        </div>
      </div>
      {what === 'home' &&
        <Article {...{
          ancestors,
          article,
          articlesInSamePage,
          articlesInSamePageForToc,
          comments,
          commentCountByLoggedInUser,
          handleShortFragmentSkipOnce,
          incomingLinks,
          issuesCount,
          latestIssues,
          loggedInUser,
          synonymLinks,
          tagged,
          topIssues,
        }}/>
      }
    </div>
    {(itemType === 'article' || itemType === 'discussion' || itemType === 'like') &&
      <ArticleList {...{
        articles,
        articlesCount,
        handleShortFragmentSkipOnce,
        hasUnlisted,
        itemType,
        list,
        loggedInUser,
        page,
        showAuthor: what === 'likes' || what === 'followed-articles',
        what,
      }}/>
    }
    {itemType === 'comment' &&
      <CommentList {...{
        comments,
        commentsCount,
        page,
        showAuthor: false,
      }}/>
    }
    {itemType === 'user' &&
      <UserList {...{
        loggedInUser,
        page,
        users,
        usersCount,
      }}/>
    }
  </>
}
