import React from "react";
import useSWR  from "swr";

import ArticleList from "components/ArticleList";
import CustomLink from "components/CustomLink"
import ErrorMessage from "components/ErrorMessage";
import Maybe from "components/Maybe";
import TabList from "components/TabList";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";
import useMin from "front/api/useMin";
import { APP_NAME, ABOUT_HREF, DEFAULT_LIMIT, SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";

const Home = ({ articles, articlesCount, page, what }) => {
  const loggedInUser = getLoggedInUser()
  useMin(
    { articleIds: articles.map(article => article.id) },
    { articles }
  )
  let requiredLogin = false
  let paginationUrlFunc
  switch (what) {
    case 'top':
      paginationUrlFunc = routes.articlesTop
      break
    case 'top-followed':
      paginationUrlFunc = routes.articlesTopFollowed
      requiredLogin = true
      break
    case 'latest':
      paginationUrlFunc = routes.articlesLatest
      break
    case 'latest-followed':
      paginationUrlFunc = routes.articlesLatestFollowed
      requiredLogin = true
      break
  }
  const fetchUrl = (() => {
    switch (what) {
      case 'latest-followed':
        return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
          page * DEFAULT_LIMIT
        }`;
      case 'top-followed':
        return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
          page * DEFAULT_LIMIT
        }&sort=score`;
      default:
        if (requiredLogin) {
          throw new Error(`Unknown search: ${what}`)
        }
    }
  })()
  const { data, error } = useSWR(
    () => {
      if (!loggedInUser) {
        throw new Error()
      }
      return fetchUrl
    },
    fetcher(requiredLogin),
  );
  ;({ articles, articlesCount } = data || {
    articles: [],
    articlesCount: 0,
  })
  let articleList
  if (!requiredLogin || loggedInUser) {
    articleList = <ArticleList {...{
      articles,
      articlesCount,
      paginationUrlFunc,
      showAuthor: true,
      what,
    }}/>
    if (requiredLogin) {
      if (error) {
        articleList = <ErrorMessage message="Cannot load recent articles..." />;
      } else if (!data) {
        articleList = <div className="article-preview">Loading articles...</div>;
      }
    }
  } else {
    articleList = (
      <div>
        <p>Welcome to {APP_NAME}!</p>
        <p>The goals of this website are described at: <a href={ABOUT_HREF}>{ABOUT_HREF}</a></p>
        <p>This page would show content taylored to logged-in users, so you could either:</p>
        <ul>
          <li><a href={routes.userNew()}>create an account</a>, then come back here, or <a href={routes.articleNew()}>try and create your own test article</a></li>
          <li>browse the:
            <ul>
              <li><a href={routes.articlesTop()}>top articles of all time</a></li>
              <li><a href={routes.articlesLatest()}>newest articles</a></li>
            </ul>
          </li>
        </ul>
      </div>
    )
  }
  return (
    <div className="home-page content-not-cirodown">
      <div className="tab-list">
        <CustomLink
          className={`tab-item${what === 'latest-followed' ? ' active' : ''}`}
          href={routes.articlesLatestFollowed()}
        >
          Latest Followed
        </CustomLink>
        <CustomLink
          className={`tab-item${what === 'top-followed' ? ' active' : ''}`}
          href={routes.articlesTopFollowed()}
        >
          Top Followed
        </CustomLink>
        <CustomLink
          className={`tab-item${what === 'latest' ? ' active' : ''}`}
          href={routes.articlesLatest()}
        >
          Latest
        </CustomLink>
        <CustomLink
          className={`tab-item${what === 'top' ? ' active' : ''}`}
          href={routes.articlesTop()}
        >
          Top
        </CustomLink>
      </div>
      {articleList}
    </div>
  )
}

export default Home;
