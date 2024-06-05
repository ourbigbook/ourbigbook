import Head from 'next/head'
import React from 'react'
import { useRouter } from 'next/router'

import { AppContext, ArticleIcon, NewArticleIcon, TopicIcon, TopicsHelp, slugFromArray} from 'front'
import { idToTitle } from 'ourbigbook'
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
  // TODO not ideal. Only Articles are really possible. This is to appease ArticleList.
  articles: (ArticleType & IssueType & TopicType)[];
  articlesCount: number;
  hasUnlisted: boolean;
  list: boolean;
  loggedInUser?: UserType;
  order: string;
  topic: TopicType;
  page: number;
  what: string;
}

export const TopicPage = ({
  articles,
  articlesCount,
  hasUnlisted,
  list,
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
    <div className="topic-page">
      {topic
        ? <>
            <div className="content-not-ourbigbook">
              <h1><a href=""><TopicIcon /> <span className="ourbigbook-title" dangerouslySetInnerHTML={{ __html: topic.titleRender }} /></a></h1>
              <TopicsHelp />
              <div className="tab-list">
                <CustomLink
                  className={`tab-item${order === 'score' ? ' active' : ''}`}
                  href={routes.topic(topicId, { sort: 'score' })}
                >
                  <ArticleIcon /> Top Articles
                </CustomLink>
                <CustomLink
                  className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
                  href={routes.topic(topicId, { sort: 'created' })}
                >
                  <ArticleIcon /> Latest Articles
                </CustomLink>
                <CustomLink
                  className="tab-item btn small"
                  href={routes.articleNew({ title: topic.titleSource })}
                  updatePreviousPage={true}
                >
                  <NewArticleIcon /> New Article in Topic
                </CustomLink>
              </div>
            </div>
            <ArticleList {...{
              articles,
              articlesCount,
              hasUnlisted,
              list,
              loggedInUser,
              page,
              paginationUrlFunc,
              showAuthor: true,
              showBody: true,
              what,
            }}/>
          </>
        : <>
            <div className="content-not-ourbigbook">
              <h1><TopicIcon /> Topic does not exist: {topicId}</h1>
              <div>
                <CustomLink
                  className="btn new"
                  href={routes.articleNew({ 'title': idToTitle(topicId) })}
                  updatePreviousPage={true}
                >
                  <NewArticleIcon title={false}/>{' '}Create an article for this topic
                </CustomLink>
              </div>
            </div>
          </>
      }
    </div>
  )
}

export default TopicPage
