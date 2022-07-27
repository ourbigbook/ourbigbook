import Head from 'next/head'
import React from 'react'
import { useRouter } from 'next/router'

import { AppContext, ArticleIcon, NewArticleIcon, TopicIcon, slugFromArray} from 'front'
import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import Maybe from 'front/Maybe'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'

export interface TopicPageProps {
  articles: (ArticleType & IssueType & TopicType)[];
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
  if (topic) {
    React.useEffect(() => { setTitle(topic.titleSource) }, [topic.titleSource])
  }
  if (router.isFallback) { return <LoadingSpinner />; }
  return (
    <div className="topic-page content-not-ourbigbook">
      {topic ?
        <>
          <h1><TopicIcon /> <span className="ourbigbook-title" dangerouslySetInnerHTML={{ __html: topic.titleRender }} /></h1>
          <div className="tab-list">
            <CustomLink
              className={`tab-item${order === 'score' ? ' active' : ''}`}
              href={routes.topic(topicId, { sort: 'score' })}
            >
              <ArticleIcon /> Top Articles
            </CustomLink>
            <CustomLink
              className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
              href={routes.topic(topicId, { sort: 'createdAt' })}
            >
              Latest Articles
            </CustomLink>
            <CustomLink
              className={`tab-item`}
              href={routes.articleNew({ title: topic.titleSource })}
            >
              <NewArticleIcon /> New Article in Topic
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
        </>
        :
        <>
          <h1><TopicIcon /> Topic does not exist: {topicId}</h1>
          {false &&
            <div>TODO: add a link for user to create an article with that topic.</div>
          }
        </>
      }
    </div>
  )
}

export default TopicPage
