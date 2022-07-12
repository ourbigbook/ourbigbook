import Head from 'next/head'
import { useRouter } from 'next/router'
import React from 'react'

import { AppContext, useEEdit } from 'front'
import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import CustomImage from 'front/CustomImage'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import Maybe from 'front/Maybe'
import FollowUserButton from 'front/FollowUserButton'
import { webApi } from 'front/api'
import { DisplayAndUsername, displayAndUsernameText } from 'front/user'
import routes from 'front/routes'
import Article from 'front/Article'
import ArticleInfo from 'front/ArticleInfo'
import { IndexPageProps } from 'front/IndexPage'
import { ArticleType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import UserList from 'front/UserList'

export interface UserPageProps {
  article?: ArticleType;
  articles?: (ArticleType & IssueType)[];
  articlesCount?: number;
  authoredArticleCount: number;
  comments?: CommentType[];
  issuesCount?: number;
  itemType: string;
  latestIssues?: IssueType[];
  topIssues?: IssueType[];
  loggedInUser?: UserType;
  order: string;
  page: number;
  user: UserType;
  users?: UserType[];
  usersCount?: number;
  what: string;
}

export default function UserPage({
  article,
  articles,
  articlesCount,
  authoredArticleCount,
  comments,
  issuesCount,
  itemType,
  latestIssues,
  loggedInUser,
  order,
  page,
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
    case 'following':
      paginationUrlFunc = page => routes.userFollowing(user.username, { page })
      break
    case 'followed':
      paginationUrlFunc = page => routes.userFollowed(user.username, { page })
      break
    case 'likes':
      paginationUrlFunc = page => routes.userLikes(user.username, { page })
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
  return (
    <div className="profile-page content-not-ourbigbook">
      <div className="user-info">
        <h1>
          <DisplayAndUsername user={user}></DisplayAndUsername>
          {' '}
          <FollowUserButton {...{ loggedInUser, user, showUsername: false }}/>
          <Maybe test={isCurrentUser}>
            <CustomLink
              href={routes.userEdit()}
              className="btn btn-sm btn-outline-secondary action-btn"
            >
              <i className="ion-gear-a" /> Settings
            </CustomLink>
          </Maybe>
          {isCurrentUser &&
            <LogoutButton />
          }
        </h1>
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
          Home
        </CustomLink>
        <CustomLink
          href={routes.userArticles(username, { sort: 'score' })}
          className={`tab-item${what === 'user-articles' && order === 'score' ? ' active' : ''}`}
        >
          Top
        </CustomLink>
        <CustomLink
          href={routes.userArticles(username,  { sort: 'createdAt' })}
          className={`tab-item${what === 'user-articles' && order === 'createdAt' ? ' active' : ''}`}
        >
          Latest
        </CustomLink>
        <CustomLink
          href={routes.userLikes(username)}
          className={`tab-item${what === 'likes' ? ' active' : ''}`}
        >
          Liked
        </CustomLink>
        <CustomLink
          href={routes.userFollowing(username)}
          className={`tab-item${what === 'following' ? ' active' : ''}`}
        >
          Follows
        </CustomLink>
        <CustomLink
          href={routes.userFollowed(username)}
          className={`tab-item${what === 'followed' ? ' active' : ''}`}
        >
          Followed
        </CustomLink>
      </div>
      {what === 'home' &&
        <>
          <ArticleInfo {...{ article, loggedInUser }}/>
          <Article {...{
            article,
            comments,
            latestIssues,
            issuesCount,
            loggedInUser,
            topIssues,
          }}/>
        </>
      }
      {itemType === 'article' &&
        <ArticleList {...{
          articles,
          articlesCount,
          loggedInUser,
          page,
          paginationUrlFunc,
          showAuthor: what === 'likes',
          what,
        }}/>
      }
      {itemType === 'user' &&
        <UserList {...{
          loggedInUser,
          page,
          paginationUrlFunc,
          users,
          usersCount,
        }}/>
      }
    </div>
  );
}
