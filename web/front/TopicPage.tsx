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
  order: string;
  topic: TopicType;
  page: number;
  what: string;
}

export const TopicPage = ({
  articles,
  articlesCount,
  loggedInUser,
  order,
  page,
  topic,
  what
}: TopicPageProps) => {
  const router = useRouter();
  const topicId = slugFromArray(router.query.id)
  const paginationUrlFunc = (page) => routes.topic(topicId, { page, sort: order })
  const { setTitle } = React.useContext(AppContext)
  React.useEffect(() => { setTitle(topic.titleSource) }, [topic.titleSource])
  if (router.isFallback) { return <LoadingSpinner />; }
  return (
    <div className="topic-page content-not-ourbigbook">
      <h1 className="ourbigbook-title" dangerouslySetInnerHTML={{ __html: topic.titleRender }}></h1>
      <div className="tab-list">
        <CustomLink
          className={`tab-item${order === 'score' ? ' active' : ''}`}
          href={routes.topic(topicId, { sort: 'score' })}
        >
          Top articles
        </CustomLink>
        <CustomLink
          className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
          href={routes.topic(topicId, { sort: 'createdAt' })}
        >
          Latest articles
        </CustomLink>
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
