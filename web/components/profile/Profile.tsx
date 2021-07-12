import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import useSWR  from "swr";

import ArticleList from "components/article/ArticleList";
import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import LoadingSpinner from "components/common/LoadingSpinner";
import Maybe from "components/common/Maybe";
import EditProfileButton from "components/profile/EditProfileButton";
import FollowUserButton, { FollowUserButtonContext } from "components/profile/FollowUserButton";
import { SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const ProfileHoc = (tab) => {
  return ({ profile }) => {
    const router = useRouter();
    if (router.isFallback) { return <LoadingSpinner />; }
    const { data: profileApi, error } = useSWR(`${SERVER_BASE_URL}/profiles/${profile.username}`, fetcher);
    if (profileApi !== undefined) {
      profile = profileApi.profile
    }
    const { username, bio, image } = profile;
    const loggedInUser = getLoggedInUser()
    const isCurrentUser = loggedInUser && username === loggedInUser?.username;
    const [following, setFollowing] = React.useState(false)
    React.useEffect(() => {
      setFollowing(profile.following)
    }, [profile.following])
    return (
      <>
        <Head>
          <title>{username}</title>
        </Head>
        <div className="profile-page content-not-cirodown">
          <div className="user-info">
            <h1>{username}</h1>
            <CustomImage
              src={image}
              alt="User's profile image"
              className="user-img"
            />
            <p>{bio}</p>
            <EditProfileButton isCurrentUser={isCurrentUser} />
            <FollowUserButtonContext.Provider value={{following, setFollowing}}>
              <FollowUserButton profile={profile} />
            </FollowUserButtonContext.Provider>
          </div>
          <div className="tab-list">
              <CustomLink
                href="/profile/[pid]"
                as={`/profile/${encodeURIComponent(username)}`}
                className={`tab-item${tab === 'my-posts' ? ' active' : ''}`}
              >
                All Articles
              </CustomLink>
              <CustomLink
                href="/profile/[pid]/favorites"
                as={`/profile/${encodeURIComponent(username)}/favorites`}
                className={`tab-item${tab === 'favorites' ? ' active' : ''}`}
              >
                Favorited Articles
              </CustomLink>
          </div>
          <ArticleList what={tab} />
        </div>
      </>
    );
  };
}

export default ProfileHoc;
