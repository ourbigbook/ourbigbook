import Head from 'next/head'
import { useRouter } from 'next/router'
import React from 'react'

import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import CustomImage from 'front/CustomImage'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import Maybe from 'front/Maybe'
import FollowUserButton from 'front/FollowUserButton'
import UserAPI from 'front/api/user'
import { DisplayAndUsername, displayAndUsernameText } from 'front/user'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'
import { AppContext } from 'front'
import useMin from 'front/api/useMin'
import Article from 'front/Article'
import ArticleInfo from 'front/ArticleInfo'

export default function UserPage({
  article,
  articles,
  articlesCount,
  authoredArticleCount,
  comments,
  likedArticleCount,
  loggedInUser,
  user,
  what
}) {
  const router = useRouter();
  const useMin0:any = {
    userIds: [user?.id],
  }
  const useMin1:any = {
    users: [user],
  }
  if (what !== 'home') {
    useMin0.articleIds = articles.map(article => article.id),
    useMin1.articles = articles
  }
  useMin(useMin0, useMin1)
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
          <FollowUserButton user={user} showUsername={false}/>
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
          Home ({authoredArticleCount})
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
          Liked ({likedArticleCount})
        </CustomLink>
      </div>
      {what === 'home'
        ? <>
            <ArticleInfo {...{article}}/>
            <Article {...{article, comments}} />
          </>
        : <ArticleList {...{
            articles,
            articlesCount,
            paginationUrlFunc,
            showAuthor: what === 'likes',
            what,
          }}/>
      }
    </div>
  );
}
