import Head from 'next/head'
import React from 'react'
import { useRouter } from 'next/router'

import { AppContext, slugFromArray} from 'front'
import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import Maybe from 'front/Maybe'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'

export interface TopicPageProps {
  articles: (ArticleType & IssueType)[];
  articlesCount: number;
  loggedInUser?: UserType;
  page: number;
  what: string;
}

export const TopicPage = ({ articles, articlesCount, loggedInUser, page, what }: TopicPageProps) => {
  const router = useRouter();
  const topicId = slugFromArray(router.query.id)
  let paginationUrlFunc
  switch (what) {
    case 'top':
    case 'top-followed':
      paginationUrlFunc = (page) => routes.topicArticlesTop(topicId, page)
      break
    case 'latest':
    case 'latest-followed':
      paginationUrlFunc = (page) => routes.topicArticlesLatest(topicId, page)
      break
  }
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => { setTitle(topicId) }, [topicId])
  if (router.isFallback) { return <LoadingSpinner />; }
  return (
    <div className="topic-page content-not-ourbigbook">
      <div className="tab-list">
        <CustomLink
          className={`tab-item${what === 'top' ? ' active' : ''}`}
          href={routes.topicArticlesTop(topicId)}
        >
          Top articles
        </CustomLink>
        <CustomLink
          className={`tab-item${what === 'latest' ? ' active' : ''}`}
          href={routes.topicArticlesLatest(topicId)}
        >
          Latest articles
        </CustomLink>
        {false && <>
          { /* Maybe one day, but initially, best article == best user. */ }
          <CustomLink
            href={routes.topicUsersView(topicId)}
            className={`tab-item${what === 'users' ? ' active' : ''}`}
          >
            Top Authors (TODO implement)
          </CustomLink>
        </>}
      </div>
      <ArticleList {...{
        articles,
        articlesCount,
        loggedInUser,
        page,
        paginationUrlFunc,
        showAuthor: true,
        what,
      }}/>
    </div>
  );
};

export default TopicPage
