import React from 'react'

import { AppContext, DiscussionAbout } from 'front'
import ArticleList from 'front/ArticleList'
import UserList from 'front/UserList'
import CustomLink from 'front/CustomLink'
import ErrorMessage from 'front/ErrorMessage'
import Maybe from 'front/Maybe'
import { appName, aboutHref, articleLimit, apiPath } from 'front/config'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'
import { DisplayAndUsername } from 'front/user'

export interface IndexPageProps {
  articles: ArticleType[];
  articlesCount: number;
  issueArticle?: ArticleType;
  loggedInUser?: UserType;
  page: number;
  what: string;
}

export interface UsersPageProps {
  users: UserType[];
  usersCount: number;
  loggedInUser?: UserType;
  page: number;
  what: string;
}

function IndexPageHoc({ isIssue, showUsers }) {
  return ({
    articles,
    articlesCount,
    issueArticle,
    loggedInUser,
    page,
    users,
    usersCount,
    what
  }: IndexPageProps | UsersPageProps) => {
    let paginationUrlFunc
    let isUsers
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
      case 'users-top':
        paginationUrlFunc = (page) => routes.users({ page, sort: 'score' })
        isUsers = true
        break
      case 'users-latest':
        paginationUrlFunc = (page) => routes.users({ page })
        isUsers = true
        break
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(
      () => { setTitle(
        isIssue ? `Discussion: ${ issueArticle.file.titleSource } by ${ issueArticle.author.displayName }` : ''
      )},
      []
    )
    return (
      <div className="home-page content-not-ourbigbook">
        {isIssue && <DiscussionAbout article={issueArticle}/>}
        <div className="tab-list">
          {(loggedInUser && !isIssue) &&
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
            href={isIssue ? routes.issuesLatest(issueArticle.slug) : loggedInUser ? routes.articlesLatest() : routes.articlesLatestFollowed()}
          >
            Latest
          </CustomLink>
          <CustomLink
            className={`tab-item${what === 'top' ? ' active' : ''}`}
            href={isIssue ? routes.issuesTop(issueArticle.slug) : routes.articlesTop()}
          >
            Top
          </CustomLink>
          {showUsers &&
            <>
              <CustomLink
                className={`tab-item${what === 'users-top' ? ' active' : ''}`}
                href={routes.users({ sort: 'score' })}
              >
                Top Users
              </CustomLink>
              <CustomLink
                className={`tab-item${what === 'users-latest' ? ' active' : ''}`}
                href={routes.users()}
              >
                New Users
              </CustomLink>
            </>
          }
          <CustomLink
            className="tab-item"
            href={isIssue ? routes.issueNew(issueArticle.slug) : routes.articleNew()}
          >
            <i className="ion-edit" /> New {isIssue ? 'thread' : 'article'}
          </CustomLink>
        </div>
        {isUsers ?
          <UserList {...{
            loggedInUser,
            page,
            paginationUrlFunc,
            users,
            usersCount,
            what,
          }}/>
          :
          <ArticleList {...{
            articles,
            articlesCount,
            isIssue,
            issueArticle,
            loggedInUser,
            page,
            paginationUrlFunc,
            showAuthor: true,
            what,
          }}/>
        }
      </div>
    )
  }
}

export default IndexPageHoc;
