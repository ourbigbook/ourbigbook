import React from 'react'

import { AppContext, ArticleIcon, DiscussionAbout, NewArticleIcon, TopicIcon, UserIcon } from 'front'
import ArticleList from 'front/ArticleList'
import UserList from 'front/UserList'
import CustomLink from 'front/CustomLink'
import ErrorMessage from 'front/ErrorMessage'
import Maybe from 'front/Maybe'
import { appName, aboutUrl, articleLimit, apiPath } from 'front/config'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import { TopicType } from 'front/types/TopicType'
import { DisplayAndUsername } from 'front/user'

export interface IndexPageProps {
  articles?: (ArticleType & IssueType & TopicType)[];
  articlesCount?: number;
  issueArticle?: ArticleType;
  followed?: boolean;
  itemType?: string;
  loggedInUser?: UserType;
  order: string;
  page: number;
  users?: UserType[];
  usersCount?: number;
}

function IndexPageHoc({
  defaultItemType='article',
  isHomepage=false
}) {
  return ({
    articles,
    articlesCount,
    followed=false,
    issueArticle,
    itemType,
    loggedInUser,
    order,
    page,
    users,
    usersCount,
  }: IndexPageProps) => {
    if (itemType === undefined) {
      itemType = defaultItemType
    }
    let paginationUrlFunc
    let isIssue, isUsers
    switch (itemType) {
      case 'article':
        if (followed) {
          paginationUrlFunc = (page) => routes.articlesFollowed({ page, sort: order })
        } else {
          paginationUrlFunc = (page) => routes.articles({ page, sort: order })
        }
        break
      case 'discussion':
        paginationUrlFunc = (page) => routes.issues(issueArticle.slug, { page, sort: order })
        isIssue = true
        break
      case 'topic':
        paginationUrlFunc = (page) => routes.topics({ page, sort: order })
        break
      case 'user':
        paginationUrlFunc = (page) => routes.users({ page, sort: order })
        isUsers = true
        break
    }
    const showFollowed = loggedInUser && !isIssue
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(
      () => { setTitle(
        isIssue ? `Discussion: ${ issueArticle.titleSource } by ${ issueArticle.author.displayName }` : ''
      )},
      []
    )
    return (
      <div className="home-page content-not-ourbigbook">
        {isIssue && <DiscussionAbout article={issueArticle}/>}
        <div className="tab-list">
          {isHomepage &&
            <CustomLink
              className={`tab-item${itemType === 'topic' ? ' active' : ''}`}
              href={routes.topics({ loggedInUser, sort: 'article-count' })}
            >
              <TopicIcon /> Topics
            </CustomLink>
          }
          {showFollowed &&
            <>
              <CustomLink
                className={`tab-item${itemType === 'article' && order === 'createdAt' && followed ? ' active' : ''}`}
                href={routes.articlesFollowed()}
              >
                <ArticleIcon /> Latest Followed
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'article' && order === 'score' && followed ? ' active' : ''}`}
                href={routes.articlesFollowed({ sort: 'score' })}
              >
                <ArticleIcon /> Top Followed
              </CustomLink>
            </>
          }
          <CustomLink
            className={`tab-item${(itemType === 'article' || itemType === 'discussion') && order === 'createdAt' && !followed ? ' active' : ''}`}
            href={isIssue ? routes.issues(issueArticle.slug, { sort: 'created' }) : routes.articles()}
          >
            <ArticleIcon /> Latest<span className="mobile-hide">  Articles</span>
          </CustomLink>
          <CustomLink
            className={`tab-item${(itemType === 'article' || itemType === 'discussion') && order === 'score' && !followed ? ' active' : ''}`}
            href={isIssue ? routes.issues(issueArticle.slug, { sort: 'score' }) : routes.articles({ sort: 'score' })}
          >
            <ArticleIcon /> Top<span className="mobile-hide"> Articles</span>
          </CustomLink>
          {isHomepage &&
            <>
              <CustomLink
                className={`tab-item${itemType === 'user' && order === 'score' ? ' active' : ''}`}
                href={routes.users({ sort: 'score' })}
              >
                <UserIcon /> Top Users
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'user'  && order === 'createdAt' ? ' active' : ''}`}
                href={routes.users({ sort: 'created' })}
              >
                <UserIcon /> New Users
              </CustomLink>
            </>
          }
          <CustomLink
            className="tab-item"
            href={isIssue ? routes.issueNew(issueArticle.slug) : routes.articleNew()}
          >
            <NewArticleIcon /> New {isIssue ? 'Discussion' : 'Article'}
          </CustomLink>
        </div>
        {isUsers
          ? <UserList {...{
              loggedInUser,
              page,
              paginationUrlFunc,
              users,
              usersCount,
            }}/>
          : <ArticleList {...{
              articles,
              articlesCount,
              followed,
              issueArticle,
              itemType,
              loggedInUser,
              page,
              paginationUrlFunc,
              showAuthor: true,
            }}/>
        }
      </div>
    )
  }
}

export default IndexPageHoc;
