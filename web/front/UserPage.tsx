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
import { UserType } from 'front/types/UserType'

export interface UserPageProps {
  article?: ArticleType;
  articles?: ArticleType[];
  articlesCount?: number;
  authoredArticleCount: number;
  comments?: CommentType[];
  loggedInUser?: UserType;
  page: number;
  user: UserType;
  what: string;
}

export default function UserPage({
  article,
  articles,
  articlesCount,
  authoredArticleCount,
  comments,
  issuesCount,
  latestIssues,
  loggedInUser,
  page,
  topIssues,
  user,
  what,
}: UserPageProps) {
  const router = useRouter();
  const username = user?.username
  const isCurrentUser = loggedInUser && username === loggedInUser?.username
  let paginationUrlFunc
  switch (what) {
    case 'likes':
      paginationUrlFunc = page => routes.userViewLikes(user.username, page)
      break
    case 'user-articles-top':
      paginationUrlFunc = page => routes.userViewTop(user.username, page)
      break
    case 'user-articles-latest':
      paginationUrlFunc = page => routes.userViewLatest(user.username, page)
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
          href={routes.userView(username)}
          className={`tab-item${what === 'home' ? ' active' : ''}`}
        >
          Home
        </CustomLink>
        <CustomLink
          href={routes.userViewTop(username)}
          className={`tab-item${what === 'user-articles-top' ? ' active' : ''}`}
        >
          Top
        </CustomLink>
        <CustomLink
          href={routes.userViewLatest(username)}
          className={`tab-item${what === 'user-articles-latest' ? ' active' : ''}`}
        >
          Latest
        </CustomLink>
        <CustomLink
          href={routes.userViewLikes(username)}
          className={`tab-item${what === 'likes' ? ' active' : ''}`}
        >
          Liked
        </CustomLink>
      </div>
      {what === 'home'
        ? <>
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
        : <ArticleList {...{
            articles,
            articlesCount,
            loggedInUser,
            page,
            paginationUrlFunc,
            showAuthor: what === 'likes',
            what,
          }}/>
      }
    </div>
  );
}
