import { useRouter } from 'next/router'
import React from 'react'

import { AppContext, ArticleIcon, useEEdit, HomeIcon, IssueIcon, LikeIcon, UserIcon } from 'front'
import ArticleList from 'front/ArticleList'
import { cant  } from 'front/cant'
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
import { ArticleType, ArticleLinkType  } from 'front/types/ArticleType'
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
  incomingLinks?: ArticleLinkType[];
  issuesCount?: number;
  itemType?: 'article' | 'discussion' | 'like'| 'topic' | 'user';
  latestIssues?: IssueType[];
  loggedInUser?: UserType;
  order: string;
  page: number;
  synonymLinks?: ArticleLinkType[];
  tagged?: ArticleLinkType[];
  topIssues?: IssueType[];
  user: UserType;
  users?: UserType[];
  usersCount?: number;
  what: 'follows' | 'followed' | 'followed-articles' | 'home' | 'liked' | 'likes' | 'user-issues' | 'user-articles';
}

export default function UserPage({
  article,
  articles,
  articlesCount,
  articlesInSamePage,
  articlesInSamePageForToc,
  ancestors,
  comments,
  commentCountByLoggedInUser,
  incomingLinks,
  issuesCount,
  itemType,
  latestIssues,
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
  let paginationUrlFunc
  switch (what) {
    case 'follows':
      paginationUrlFunc = page => routes.userFollows(user.username, { page })
      break
    case 'followed':
      paginationUrlFunc = page => routes.userFollowed(user.username, { page })
      break
    case 'followed-articles':
      paginationUrlFunc = page => routes.userFollowsArticles(user.username, { page })
      break
    case 'liked':
      paginationUrlFunc = page => routes.userLiked(user.username, { page })
      break
    case 'likes':
      paginationUrlFunc = page => routes.userLikes(user.username, { page })
      break
    case 'user-issues':
      paginationUrlFunc = page => routes.userIssues(user.username, { page, sort: order })
      break
    case 'user-articles':
      paginationUrlFunc = page => routes.userArticles(user.username, { page, sort: order })
      break
  }
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
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => {
    setTitle(displayAndUsernameText(user))
  }, [user?.displayName, user?.username])

  if (router.isFallback) { return <LoadingSpinner />; }
  return (<>
    <div className="profile-page">
      <div className="user-info content-not-ourbigbook">
        <h1>
          <DisplayAndUsername user={user}></DisplayAndUsername>
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
            <>
              <LogoutButton />
            </>
          }
        </div>
        {user.admin && <h2><i className="ion-star" /> <a href={`${config.docsUrl}/ourbigbook-web-admin`}>{config.appName} admin</a> <i className="ion-star" /> </h2>}
        <CustomImage
          src={user.effectiveImage}
          alt="User's profile image"
          className="user-img"
        />
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
            <ArticleIcon /> Top
          </CustomLink>
          <CustomLink
            href={routes.userArticles(username,  { sort: 'created' })}
            className={`tab-item${what === 'user-articles' && order === 'createdAt' ? ' active' : ''}`}
          >
            <ArticleIcon /> Latest
          </CustomLink>
          <CustomLink
            href={routes.userLikes(username)}
            className={`tab-item${what === 'likes' ? ' active' : ''}`}
          >
            <ArticleIcon /> Likes
          </CustomLink>
          <CustomLink
            href={routes.userLiked(username)}
            className={`tab-item${what === 'liked' ? ' active' : ''}`}
          >
            <LikeIcon /> Received likes
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
            href={routes.userFollowsArticles(username)}
            className={`tab-item${what === 'followed-articles' ? ' active' : ''}`}
          >
            <ArticleIcon /> Follows
          </CustomLink>
          <CustomLink
            href={routes.userIssues(user.username, { sort: 'created' })}
            className={`tab-item${itemType === 'discussion' && order === 'createdAt' ? ' active' : ''}`}
          >
            <IssueIcon /> Latest
          </CustomLink>
          <CustomLink
            href={routes.userIssues(user.username, { sort: 'score' })}
            className={`tab-item${itemType === 'discussion' && order === 'score' ? ' active' : ''}`}
          >
            <IssueIcon /> Top
          </CustomLink>
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
          latestIssues,
          incomingLinks,
          issuesCount,
          loggedInUser,
          synonymLinks,
          tagged,
          topIssues,
        }}/>
      }
    </div>
    {(itemType === 'article' || itemType === 'discussion' || itemType === 'like') &&
      <div className="content-not-ourbigbook">
        <ArticleList {...{
          articles,
          articlesCount,
          itemType,
          loggedInUser,
          page,
          paginationUrlFunc,
          showAuthor: what === 'likes' || what === 'followed-articles',
          what,
        }}/>
      </div>
    }
    {itemType === 'user' &&
      <div className="content-not-ourbigbook">
        <UserList {...{
          loggedInUser,
          page,
          paginationUrlFunc,
          users,
          usersCount,
        }}/>
      </div>
    }
  </>);
}
