import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import useSWR  from "swr";

import ArticleList from "components/article/ArticleList";
import CustomLink from "components/common/CustomLink";
import LoadingSpinner from "components/common/LoadingSpinner";
import LogoutButton from "components/common/LogoutButton";
import Maybe from "components/common/Maybe";
import { slugFromArray} from "lib";
import { SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

export const TopicHoc = (tab) => {
  return ({ }) => {
    const router = useRouter();
    const loggedInUser = getLoggedInUser()
    if (router.isFallback) { return <LoadingSpinner />; }
    const topicId = slugFromArray(router.query.id)
    return (
      <>
        <Head>
          <title>{topicId}</title>
        </Head>
        <div className="topic-page content-not-cirodown">
          <div className="user-info">
            <h1>{topicId}</h1>
          </div>
          {false && <>
            { /* Maybe one day, but initially, best article == best user. */ }
            <div className="tab-list">
              <CustomLink
                href={routes.topicArticlesView(topicId)}
                className={`tab-item${tab === 'articles' ? ' active' : ''}`}
              >
                Top Articles
              </CustomLink>
              <CustomLink
                href={routes.topicUsersView(topicId)}
                className={`tab-item${tab === 'users' ? ' active' : ''}`}
              >
                Top Authors (TODO implement)
              </CustomLink>
            </div>
          </>}
          <ArticleList what={'topic-' + tab} topicId={topicId}/>
        </div>
      </>
    );
  };
};

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
    props: { articles: [] },
  }
}
