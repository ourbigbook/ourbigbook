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
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import { DisplayAndUsername } from 'front/user'

export interface IndexPageProps {
  articles?: (ArticleType & IssueType)[];
  articlesCount?: number;
  issueArticle?: ArticleType;
  followed: boolean;
  loggedInUser?: UserType;
  order: string;
  page: number;
  users?: UserType[];
  usersCount?: number;
  what: string;
}

function IndexPageHoc({ isIssue=false, showUsers=false }) {
  return ({
    articles,
    articlesCount,
    followed,
    issueArticle,
    loggedInUser,
    order,
    page,
    users,
    usersCount,
    what,
  }: IndexPageProps) => {
    let paginationUrlFunc
    let isUsers
    switch (what) {
      case 'articles':
        if (followed) {
          paginationUrlFunc = (page) => routes.articlesFollowed({ page, sort: order })
        } else {
          paginationUrlFunc = (page) => routes.articles({ page, sort: order })
        }
        break
      case 'users':
        paginationUrlFunc = (page) => routes.users({ page, sort: order })
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
                className={`tab-item${what === 'articles' && order === 'createdAt' && followed ? ' active' : ''}`}
                href={routes.articlesFollowed()}
              >
                Latest Followed
              </CustomLink>
              <CustomLink
                className={`tab-item${what === 'articles' && order === 'score' && followed ? ' active' : ''}`}
                href={routes.articlesFollowed({ sort: 'score' })}
              >
                Top Followed
              </CustomLink>
            </>
          }
          <CustomLink
            className={`tab-item${what === 'articles' && order === 'createdAt' && !followed ? ' active' : ''}`}
            href={isIssue ? routes.issuesLatest(issueArticle.slug) : routes.articles({ loggedInUser })}
          >
            Latest
          </CustomLink>
          <CustomLink
            className={`tab-item${what === 'articles' && order === 'score' && !followed ? ' active' : ''}`}
            href={isIssue ? routes.issuesTop(issueArticle.slug) : routes.articles({ loggedInUser, sort: 'score' })}
          >
            Top
          </CustomLink>
          {showUsers &&
            <>
              <CustomLink
                className={`tab-item${what === 'users' && order === 'score' ? ' active' : ''}`}
                href={routes.users({ sort: 'score' })}
              >
                Top Users
              </CustomLink>
              <CustomLink
                className={`tab-item${what === 'users'  && order === 'createdAt' ? ' active' : ''}`}
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
