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
import { DEFAULT_USER_SCORE_TITLE } from "lib/utils/constant"
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const ProfileHoc = (tab) => {
  return ({ profile, authoredArticleCount, favoritedArticleCount }) => {
    const router = useRouter();
    const { data: profileApi, error } = useSWR(UserAPI.url(profile?.username), fetcher(router.isFallback));
    if (profileApi !== undefined) {
      profile = profileApi.user
    }
    const username = profile?.username
    const loggedInUser = getLoggedInUser()
    const isCurrentUser = loggedInUser && username === loggedInUser?.username
    const [following, setFollowing] = React.useState(false)
    const [followerCount, setFollowerCount] = React.useState(profile?.followerCount)
    React.useEffect(() => {
      setFollowing(profile?.following)
      setFollowerCount(profile?.followerCount)
    }, [
      profile?.following,
      profile?.followerCount,
    ])
    if (router.isFallback) { return <LoadingSpinner />; }
    return (
      <>
        <Head>
          <title>{username}</title>
        </Head>
        <div className="profile-page content-not-cirodown">
          <div className="user-info">
            <h1>{username} <span title={DEFAULT_USER_SCORE_TITLE}>({profile.articleScoreSum})</span>
            </h1>
            <p>
              <FollowUserButtonContext.Provider value={{following, setFollowing, followerCount, setFollowerCount}}>
                <FollowUserButton profile={profile} showUsername={false}/>
              </FollowUserButtonContext.Provider>
              {isCurrentUser &&
                <LogoutButton />
              }
              <EditProfileButton isCurrentUser={isCurrentUser} />
            </p>
            <CustomImage
              src={profile.effectiveImage}
              alt="User's profile image"
              className="user-img"
            />
            <p>{profile.bio}</p>
          </div>
          <h2>Articles ({authoredArticleCount})</h2>
          <div className="tab-list">
            <CustomLink
              href={routes.userView(username)}
              className={`tab-item${tab === 'my-articles-top' ? ' active' : ''}`}
            >
              Top
            </CustomLink>
            <CustomLink
              href={routes.userViewLatest(username)}
              className={`tab-item${tab === 'my-articles-latest' ? ' active' : ''}`}
            >
              Latest
            </CustomLink>
            <CustomLink
              href={routes.userViewFavorites(username)}
              className={`tab-item${tab === 'favorites' ? ' active' : ''}`}
            >
              Favorited ({favoritedArticleCount})
            </CustomLink>
          </div>
          <ArticleList what={tab} />
        </div>
      </>
    );
  };
}

export default ProfileHoc;
