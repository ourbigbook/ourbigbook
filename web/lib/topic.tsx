import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import useSWR  from "swr";

import ArticleList from "components/ArticleList";
import CustomLink from "components/CustomLink";
import LoadingSpinner from "components/LoadingSpinner";
import LogoutButton from "components/LogoutButton";
import Maybe from "components/Maybe";
import { AppContext, slugFromArray} from "lib";
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
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(() => { setTitle(topicId) }, [topicId])
    return (
      <>
        <div className="topic-page content-not-cirodown">
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

// Server-only code

import { GetStaticProps, GetStaticPaths } from 'next'

import { fallback, revalidate } from "config";
import sequelize from "lib/db";

export const getStaticPathsTopic: GetStaticPaths = async () => {
  return {
    fallback,
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
