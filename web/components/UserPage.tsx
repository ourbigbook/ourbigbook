import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import useSWR  from "swr";

import ArticleList from "components/ArticleList";
import CustomLink from "components/CustomLink";
import CustomImage from "components/CustomImage";
import LoadingSpinner from "components/LoadingSpinner";
import LogoutButton from "components/LogoutButton";
import Maybe from "components/Maybe";
import EditProfileButton from "components/EditProfileButton";
import FollowUserButton, { FollowUserButtonContext } from "components/FollowUserButton";
import UserAPI from "lib/api/user";
import { DisplayAndUsername, displayAndUsernameText } from "front/user"
import { DEFAULT_USER_SCORE_TITLE } from "lib/utils/constant"
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";
import { AppContext } from 'lib'
import useMin from "front/api/useMin";


export default function UserPage({
  articles,
  articlesCount,
  user,
  authoredArticleCount,
  likedArticleCount,
  what
}) {
  const router = useRouter();
  useMin(
    {
      articleIds: articles.map(article => article.id),
      userIds: [user?.id],
    },
    {
      articles,
      users: [user],
    }
  )
  const username = user?.username
  const loggedInUser = getLoggedInUser()
  const isCurrentUser = loggedInUser && username === loggedInUser?.username
  let paginationUrlFunc
  switch (what) {
    case 'likes':
      paginationUrlFunc = page => routes.userViewLikes(user.username, page)
      break
    case 'user-articles-top':
      paginationUrlFunc = page => routes.userView(user.username, page)
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
    <div className="profile-page content-not-cirodown">
      <div className="user-info">
        <h1><DisplayAndUsername user={user}></DisplayAndUsername></h1>
        <p>
          <FollowUserButtonContext.Provider value={{following, setFollowing, followerCount, setFollowerCount}}>
            <FollowUserButton user={user} showUsername={false}/>
          </FollowUserButtonContext.Provider>
          <EditProfileButton isCurrentUser={isCurrentUser} />
          {isCurrentUser &&
            <LogoutButton />
          }
        </p>
        <CustomImage
          src={user.effectiveImage}
          alt="User's profile image"
          className="user-img"
        />
        <p>{user.bio}</p>
      </div>
      <h2>Articles ({authoredArticleCount})</h2>
      <div className="tab-list">
        <CustomLink
          href={routes.userView(username)}
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
      <ArticleList {...{
        articles,
        articlesCount,
        paginationUrlFunc,
        showAuthor: what === 'likes',
        what,
      }}/>
    </div>
  );
}
