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
import { SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const TopicHoc = (tab) => {
  return ({ }) => {
    const router = useRouter();
    const loggedInUser = getLoggedInUser()
    const isCurrentUser = loggedInUser && username === loggedInUser?.username
    return (
      <>
        <Head>
          <title>{username}</title>
        </Head>
        <div className="topic-page content-not-cirodown">
          <div className="user-info">
            <h1>{username}</h1>
            <CustomImage
              src={image}
              alt="User's profile image"
              className="user-img"
            />
            <p>{bio}</p>
            {isCurrentUser &&
              <LogoutButton />
            }
            <EditProfileButton isCurrentUser={isCurrentUser} />
            <FollowUserButtonContext.Provider value={{following, setFollowing}}>
              <FollowUserButton profile={profile} />
            </FollowUserButtonContext.Provider>
          </div>
          <div className="tab-list">
            <CustomLink
              href={routes.topicArticlesView(username)}
              className={`tab-item${tab === 'articles' ? ' active' : ''}`}
            >
              Authored Articles
            </CustomLink>
            <CustomLink
              href={routes.topicUsersView(username)}
              className={`tab-item${tab === 'users' ? ' active' : ''}`}
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
export default TopicHoc;

import { GetStaticProps, GetStaticPaths } from 'next'

import { revalidate } from "config";
import sequelize from "lib/db";

export const getStaticPathsTopic: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: [],
  }
}

export const getStaticPropsTopic: GetStaticProps = async ({ params: { id } }) => {
  //const user = await sequelize.models.User.findOne({
  //  where: { username: uid },
  //})
  //if (!user) {
  //  return {
  //    notFound: true
  //  }
  //}
  return {
    revalidate,
    //props: { profile: await user.toProfileJSONFor() },
  }
}
