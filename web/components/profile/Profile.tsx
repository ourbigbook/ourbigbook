import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import useSWR  from "swr";

import ArticleList from "components/article/ArticleList";
import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import LoadingSpinner from "components/common/LoadingSpinner";
import LogoutButton from "components/common/LogoutButton";
import Maybe from "components/common/Maybe";
import EditProfileButton from "components/profile/EditProfileButton";
import FollowUserButton, { FollowUserButtonContext } from "components/profile/FollowUserButton";
import UserAPI from "lib/api/user";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const ProfileHoc = (tab) => {
  return ({ profile }) => {
    const router = useRouter();
    const { data: profileApi, error } = useSWR(UserAPI.url(profile?.username), fetcher(router.isFallback));
    if (profileApi !== undefined) {
      profile = profileApi.user
    }
    const username = profile?.username
    const loggedInUser = getLoggedInUser()
    const isCurrentUser = loggedInUser && username === loggedInUser?.username
    const [following, setFollowing] = React.useState(false)
    React.useEffect(() => {
      setFollowing(profile?.following)
    }, [profile?.following])
    if (router.isFallback) { return <LoadingSpinner />; }
    return (
      <>
        <Head>
          <title>{username}</title>
        </Head>
        <div className="profile-page content-not-cirodown">
          <div className="user-info">
            <h1>{username}</h1>
            <p>Article score sum: { profile.articleScoreSum }</p>
            <p>
              <FollowUserButtonContext.Provider value={{following, setFollowing}}>
                <FollowUserButton profile={profile} />
              </FollowUserButtonContext.Provider>
            </p>
            <CustomImage
              src={profile.effectiveImage}
              alt="User's profile image"
              className="user-img"
            />
            <p>{profile.bio}</p>
            {isCurrentUser &&
              <LogoutButton />
            }
            <EditProfileButton isCurrentUser={isCurrentUser} />
          </div>
          <h2>Articles</h2>
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
              Favorited
            </CustomLink>
          </div>
          <ArticleList what={tab} />
        </div>
      </>
    );
  };
}

export default ProfileHoc;
