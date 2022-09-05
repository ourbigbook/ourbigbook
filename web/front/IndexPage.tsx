import React from 'react'

import {
  AppContext,
  ArticleIcon,
  DiscussionAbout,
  IssueIcon,
  NewArticleIcon,
  PinnedArticleIcon,
  SettingsIcon,
  TopicIcon,
  UserIcon,
} from 'front'
import ArticleList from 'front/ArticleList'
import UserList from 'front/UserList'
import CustomLink from 'front/CustomLink'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import FollowArticleButton from 'front/FollowArticleButton'
import { UserType } from 'front/types/UserType'
import { TopicType } from 'front/types/TopicType'

export interface IndexPageProps {
  articles?: (ArticleType & IssueType & TopicType)[];
  articlesCount?: number;
  issueArticle?: ArticleType;
  followed?: boolean;
  itemType?: 'article' | 'discussion' | 'topic' | 'user';
  loggedInUser?: UserType;
  order: string;
  page: number;
  pinnedArticle?: ArticleType;
  users?: UserType[];
  usersCount?: number;
}

function IndexPageHoc({
  pageType='home'
}={}) {
  const isHomepage = pageType === 'home'
  return ({
    articles,
    articlesCount,
    followed=false,
    issueArticle,
    itemType,
    loggedInUser,
    order,
    page,
    pinnedArticle,
    users,
    usersCount,
  }: IndexPageProps) => {
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
        if (isHomepage) {
          paginationUrlFunc = (page) => routes.issuesAll({ page, sort: order })
        } else {
          paginationUrlFunc = (page) => routes.issues(issueArticle.slug, { page, sort: order })
        }
        isIssue = true
        break
      case 'topic':
        paginationUrlFunc = (page) => routes.topics({ page, sort: order, loggedInUser })
        break
      case 'user':
        paginationUrlFunc = (page) => routes.users({ page, sort: order })
        isUsers = true
        break
    }
    const { setTitle } = React.useContext(AppContext)
    React.useEffect(
      () => { setTitle(
        (isIssue && !isHomepage) ? `Discussion: ${ issueArticle.titleSource } by ${ issueArticle.author.displayName }` : ''
      )},
      []
    )
    return (
      <div className="home-page">
        <div className="content-not-ourbigbook">
          {(isIssue && !isHomepage) && <DiscussionAbout article={issueArticle}/>}
          <div className="tab-list">
            {isHomepage &&
              <>
                <CustomLink
                  className={`tab-item${itemType === 'topic' ? ' active' : ''}`}
                  href={routes.topics({ loggedInUser, sort: 'article-count' })}
                >
                  <TopicIcon /> Topics
                </CustomLink>
                {loggedInUser &&
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
                  className={`tab-item${itemType === 'article' && order === 'createdAt' && !followed ? ' active' : ''}`}
                  href={(isIssue && !isHomepage) ? routes.issues(issueArticle.slug, { sort: 'created' }) : routes.articles()}
                >
                  <ArticleIcon /> Latest<span className="mobile-hide"> Articles</span>
                </CustomLink>
                <CustomLink
                  className={`tab-item${(itemType === 'article' || itemType === 'discussion') && order === 'score' && !followed ? ' active' : ''}`}
                  href={(isIssue && !isHomepage) ? routes.issues(issueArticle.slug, { sort: 'score' }) : routes.articles({ sort: 'score' })}
                >
                  <ArticleIcon /> Top<span className="mobile-hide"> Articles</span>
                </CustomLink>
                <CustomLink
                  className={`tab-item${itemType === 'user' && order === 'score' ? ' active' : ''}`}
                  href={routes.users({ sort: 'score' })}
                >
                  <UserIcon /> Top Users
                </CustomLink>
                <CustomLink
                  className={`tab-item${itemType === 'user' && order === 'createdAt' ? ' active' : ''}`}
                  href={routes.users({ sort: 'created' })}
                >
                  <UserIcon /> New Users
                </CustomLink>
              </>
            }
            <CustomLink
              className={`tab-item${itemType === 'discussion' && order === 'createdAt' ? ' active' : ''}`}
              href={isHomepage ? routes.issuesAll() : routes.issues(issueArticle.slug)}
            >
              <IssueIcon /> Latest<span className="mobile-hide"> Discussions</span>
            </CustomLink>
            <CustomLink
              className={`tab-item${itemType === 'discussion' && order === 'score' ? ' active' : ''}`}
              href={isHomepage ? routes.issuesAll({ sort: 'score' }) : routes.issues(issueArticle.slug, { sort: 'score' })}
            >
              <IssueIcon /> Top<span className="mobile-hide"> Discussions</span>
            </CustomLink>
            {!isHomepage &&
              <span className='tab-item'>
                <FollowArticleButton {...{
                  article: issueArticle,
                  classNames: ['btn', 'small'],
                  isIssue: false,
                  loggedInUser,
                  showText: false,
                }} />
              </span>
            }
            <CustomLink
              className="tab-item btn small"
              href={(isIssue && !isHomepage) ? routes.issueNew(issueArticle.slug) : routes.articleNew()}
              updatePreviousPage={true}
            >
              <NewArticleIcon /> New {pageType === 'articleIssues' ? 'Discussion' : 'Article'}
            </CustomLink>
          </div>
          {itemType === 'user'
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
                isIssue,
                issueArticle,
                itemType,
                loggedInUser,
                page,
                paginationUrlFunc,
                showAuthor: true,
              }}/>
          }
        </div>
        {pinnedArticle &&
          <>
            <div className="content-not-ourbigbook pinned-article">
              <PinnedArticleIcon /> Pinned article: <CustomLink href={routes.article(pinnedArticle.slug)}>{pinnedArticle.slug}</CustomLink>
            </div>
            <div
              className="ourbigbook"
              dangerouslySetInnerHTML={{ __html: pinnedArticle.render }}
            />
          </>
        }
        <div className="content-not-ourbigbook site-settings">
          <CustomLink href={routes.siteSettings()}>
            <SettingsIcon /> Site Settings
          </CustomLink>
        </div>
      </div>
    )
  }
}

export default IndexPageHoc;
