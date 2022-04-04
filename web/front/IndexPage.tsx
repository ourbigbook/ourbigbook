import React from 'react'

import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import ErrorMessage from 'front/ErrorMessage'
import Maybe from 'front/Maybe'
import useMin from 'front/api/useMin'
import { appName, aboutHref, articleLimit, apiPath } from 'front/config'
import fetcher from 'front/fetcher'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'
import { ArticleType } from 'front/types/articleType'
import { UserType } from 'front/types/userType'

export interface IndexPageProps {
  articles: ArticleType[];
  articlesCount: number;
  loggedInUser?: UserType;
  page: number;
  what: string;
}


const IndexPage = ({
  articles,
  articlesCount,
  loggedInUser,
  page,
  what
}: IndexPageProps) => {
  let paginationUrlFunc
  switch (what) {
    case 'top':
      paginationUrlFunc = routes.articlesTop
      break
    case 'top-followed':
      paginationUrlFunc = routes.articlesTopFollowed
      break
    case 'latest':
      paginationUrlFunc = routes.articlesLatest
      break
    case 'latest-followed':
      paginationUrlFunc = routes.articlesLatestFollowed
      break
  }
  return (
    <div className="home-page content-not-ourbigbook">
      <div className="tab-list">
        {loggedInUser &&
          <>
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
          </>
        }
        <CustomLink
          className={`tab-item${what === 'latest' ? ' active' : ''}`}
          href={loggedInUser ? routes.articlesLatest() : routes.articlesLatestFollowed()}
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
      <ArticleList {...{
        articles,
        articlesCount,
        paginationUrlFunc,
        showAuthor: true,
        what,
      }}/>
    </div>
  )
}

export default IndexPage;
