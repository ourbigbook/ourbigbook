import React from 'react'
import { useRouter } from 'next/router'

import {
  ArticleIcon,
  MyHead,
  NewArticleIcon,
  SeeIcon,
  TopicIcon,
  TopicsHelp,
  slugFromArray
} from 'front'
import { idToTitle } from 'ourbigbook'
import ArticleList from 'front/ArticleList'
import CustomLink from 'front/CustomLink'
import LoadingSpinner from 'front/LoadingSpinner'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'

export interface TopicPageProps {
  articleInTopicByLoggedInUser: ArticleType,
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
  articleInTopicByLoggedInUser,
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
  let titleText
  if (topic) {
    titleText = topic.titleSource
  } else {
    titleText = idToTitle(topicId)
  }
  if (router.isFallback) { return <LoadingSpinner />; }
  return <>
    <MyHead title={titleText} />
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
                  <ArticleIcon /> Top articles
                </CustomLink>
                <CustomLink
                  className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
                  href={routes.topic(topicId, { sort: 'created' })}
                >
                  <ArticleIcon /> Latest articles
                </CustomLink>
                {articleInTopicByLoggedInUser
                  ? <CustomLink
                      className="tab-item btn small"
                      href={routes.article(articleInTopicByLoggedInUser.slug)}
                    >
                      <SeeIcon /> View your article in topic
                    </CustomLink>
                  : <CustomLink
                      className="tab-item btn small"
                      href={routes.articleNew({ title: topic.titleSource })}
                      updatePreviousPage={true}
                    >
                      <NewArticleIcon /> New article in topic
                    </CustomLink>
                }
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
              showFullBody: true,
              what,
            }}/>
          </>
        : <>
            <div className="content-not-ourbigbook">
              <h1><TopicIcon /> {titleText}</h1>
              <p>There are no articles in this topic. Topic ID: {topicId}</p>
              <div>
                <CustomLink
                  className="btn new"
                  href={routes.articleNew({ 'title': titleText })}
                  updatePreviousPage={true}
                >
                  <NewArticleIcon title={false}/>{' '}Create the first article for this topic
                </CustomLink>
              </div>
              <TopicsHelp className="p" />
            </div>
          </>
      }
    </div>
  </>
}

export default TopicPage
