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
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'

export interface TopicPageProps extends CommonPropsType {
  articleInTopicByLoggedInUser: ArticleType,
  // TODO not ideal. Only Articles are really possible. This is to appease ArticleList.
  articles: (ArticleType & IssueType & TopicType)[];
  articlesCount: number;
  hasUnlisted: boolean;
  list: boolean;
  order: string;
  orderAscDesc: string;
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
  let titleText
  if (topic) {
    titleText = topic.titleSource
  } else {
    titleText = idToTitle(topicId)
  }
  if (router.isFallback) { return <LoadingSpinner />; }
  const topicIdDisplay = <div className="h2-container">
    <h2 className="meta inline" title="Topic ID">ID: {topicId}</h2>
  </div>
  return <>
    <MyHead title={titleText} />
    <div className="topic-page">
      {topic
        ? <>
            <div className="content-not-ourbigbook">
              <div className="h1-container h1">
                <h1 className="inline">
                  <TopicIcon />
                  {' '}
                  <span
                    className="ourbigbook-title"
                    dangerouslySetInnerHTML={{ __html: topic.titleRender }}
                  />
                </h1>
              </div>
              {topicIdDisplay}
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
              showAuthor: true,
              showBody: true,
              showFullBody: true,
              what,
            }}/>
          </>
        : <>
            <div className="content-not-ourbigbook">
              <div className="h1-container h1">
                <TopicIcon /> 
                {' '}
                <h1 className="inline">{titleText}</h1>
              </div>
              {topicIdDisplay}
              <p>There are no articles in this topic.</p>
              <p>
                <CustomLink
                  className="btn new"
                  href={routes.articleNew({ 'title': titleText })}
                  updatePreviousPage={true}
                >
                  <NewArticleIcon title={null}/>{' '}Create the first article for this topic
                </CustomLink>
              </p>
            </div>
          </>
      }
    </div>
    <p className="content-not-ourbigbook">
      <TopicsHelp />
    </p>
  </>
}

export default TopicPage
