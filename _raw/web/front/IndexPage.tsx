import React from 'react'

import pluralize from 'pluralize'

import {
  AlphabeticalOrderTabTitle,
  AnnounceIcon,
  ArticleIcon,
  capitalize,
  CommentIcon,
  DiscussionAbout,
  DiscussionIcon,
  MyHead,
  NewArticleIcon,
  orderToPageTitle,
  PinnedArticleIcon,
  SettingsIcon,
  StarIcon,
  TimeIcon,
  TopicIcon,
  UserIcon,
} from 'front'
import ArticleList from 'front/ArticleList'
import CommentList from 'front/CommentList'
import UserList from 'front/UserList'
import CustomLink from 'front/CustomLink'
import routes from 'front/routes'
import FollowArticleButton from 'front/FollowArticleButton'

import { ArticleType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { UserType } from 'front/types/UserType'
import { TopicType } from 'front/types/TopicType'

export interface IndexPageProps extends CommonPropsType {
  articles?: (ArticleType & IssueType & TopicType)[];
  articlesCount?: number;
  comments?: CommentType[];
  commentsCount?: number;
  issueArticle?: ArticleType;
  followed?: boolean;
  itemType?: 'article' | 'comment' | 'discussion' | 'topic' | 'user';
  order: string;
  orderAscDesc: string;
  page: number;
  pinnedArticle?: ArticleType;
  users?: UserType[];
  usersCount?: number;
}

function IndexPageHoc({
  pageType='home'
}={}) {
  // This is also used for indexes of:
  // - discussions for a given article
  const isHomepage = pageType === 'home'
  return function IndexPage({
    articles,
    articlesCount,
    comments,
    commentsCount,
    followed=false,
    issueArticle,
    itemType,
    loggedInUser,
    order,
    orderAscDesc,
    page,
    pinnedArticle,
    users,
    usersCount,
  }: IndexPageProps) {
    let title
    if (isHomepage) {
      let orderTitle = orderToPageTitle(order)
      if (orderTitle === undefined && itemType === 'topic') {
        orderTitle = 'Largest'
      }
      if (orderTitle) {
        title = `${orderTitle}${followed ? ' followed' : ''} ${pluralize(itemType)}`
      } else {
        title = pluralize(capitalize(itemType))
      }
    } else {
      title = `${ issueArticle.titleSource } by ${ issueArticle.author.displayName } - Discussion`
    }
    return <>
      <MyHead title={title} />
      <div className="home-page">
        {(!isHomepage) &&
          <div className="content-not-ourbigbook">
            <DiscussionAbout article={issueArticle}/>
          </div>
        }
        <div className="tab-list content-not-ourbigbook">
          {isHomepage
            ? <>
                <CustomLink
                  className={`tab-item${itemType === 'topic' ? ' active' : ''}`}
                  href={routes.topics({ loggedInUser, sort: 'article-count' })}
                >
                  <TopicIcon /> Topics
                </CustomLink>
                <CustomLink
                  className={`tab-item${itemType === 'article' ? ' active' : ''}`}
                  href={loggedInUser ? routes.articlesFollowed() : routes.articles()}
                >
                  <ArticleIcon /> Articles
                </CustomLink>
                <CustomLink
                  className={`tab-item${itemType === 'user' ? ' active' : ''}`}
                  href={routes.users({ sort: 'score' })}
                >
                  <UserIcon /> Users
                </CustomLink>
                <CustomLink
                  className={`tab-item${itemType === 'discussion' ? ' active' : ''}`}
                  href={routes.issues()}
                >
                  <DiscussionIcon /> Discussions
                </CustomLink>
              </>
            : <>
                <CustomLink
                  className={`tab-item${order === 'createdAt' && itemType === 'discussion' ? ' active' : ''}`}
                  href={routes.articleIssues(issueArticle.slug)}
                >
                  <DiscussionIcon /> New<span className="mobile-hide"> discussions</span>
                </CustomLink>
                <CustomLink
                  className={`tab-item${order === 'score' && itemType === 'discussion' ? ' active' : ''}`}
                  href={routes.articleIssues(issueArticle.slug, { sort: 'score' })}
                >
                  <DiscussionIcon /> Top<span className="mobile-hide"> discussions</span>
                </CustomLink>
              </>
          }
          <CustomLink
            className={`tab-item${order === 'createdAt' && itemType === 'comment'  ? ' active' : ''}`}
            href={isHomepage
              ? routes.comments({ sort: 'created' })
              : routes.articleComments(issueArticle.slug, { sort: 'created' })
            }
          >
            <CommentIcon /> Comments
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
            href={(!isHomepage) ? routes.issueNew(issueArticle.slug) : routes.articleNew()}
            updatePreviousPage={true}
          >
            <NewArticleIcon /> New {(pageType === 'articleIssues' || pageType === 'articleComments') ? 'discussion' : 'article'}
          </CustomLink>
        </div>
        {isHomepage &&
          <div className="tab-list content-not-ourbigbook">
            {itemType === 'topic' && <>
              <CustomLink
                className={`tab-item${order === 'articleCount' ? ' active' : ''}`}
                href={routes.topics({ loggedInUser, sort: 'article-count' })}
              >
                <StarIcon /> Top
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
                href={routes.topics({ loggedInUser, sort: 'created' })}
              >
                <TimeIcon /> New
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'topicId' ? ' active' : ''}`}
                href={routes.topics({ loggedInUser, sort: 'id' })}
              >
                <TopicIcon /> <AlphabeticalOrderTabTitle />
              </CustomLink>
            </>}
            {itemType === 'article' && <>
              {loggedInUser &&
                <>
                  <CustomLink
                    className={`tab-item${order === 'createdAt' && followed ? ' active' : ''}`}
                    href={routes.articlesFollowed()}
                  >
                    <TimeIcon /> New followed
                  </CustomLink>
                  <CustomLink
                    className={`tab-item${order === 'updatedAt' && followed ? ' active' : ''}`}
                    href={routes.articlesFollowed({ sort: 'updated' })}
                  >
                    <TimeIcon /> Updated followed
                  </CustomLink>
                  <CustomLink
                    className={`tab-item${order === 'score' && followed ? ' active' : ''}`}
                    href={routes.articlesFollowed({ sort: 'score' })}
                  >
                    <StarIcon /> Top followed
                  </CustomLink>
                </>
              }
              <CustomLink
                className={`tab-item${order === 'createdAt' && !followed ? ' active' : ''}`}
                href={routes.articles()}
              >
                <TimeIcon /> New
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'updatedAt' && !followed ? ' active' : ''}`}
                href={routes.articles({ sort: 'updated' })}
              >
                <TimeIcon /> Updated
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'score' && !followed ? ' active' : ''}`}
                href={routes.articles({ sort: 'score' })}
              >
                <StarIcon /> Top
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'announcedAt' && !followed ? ' active' : ''}`}
                href={routes.articles({ sort: 'announced' })}
              >
                <AnnounceIcon /> Announced
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'topicId' && !followed ? ' active' : ''}`}
                href={routes.articles({ sort: 'id' })}
              >
                <ArticleIcon /> <AlphabeticalOrderTabTitle />
              </CustomLink>
            </>}
            {itemType === 'user' && <>
              <CustomLink
                className={`tab-item${order === 'score' ? ' active' : ''}`}
                href={routes.users({ sort: 'score' })}
              >
                <StarIcon /> Top
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
                href={routes.users({ sort: 'created' })}
              >
                <TimeIcon /> New
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'username' ? ' active' : ''}`}
                href={routes.users({ sort: 'username' })}
              >
                <UserIcon /> <AlphabeticalOrderTabTitle />
              </CustomLink>
            </>}
            {itemType === 'discussion' && <>
              <CustomLink
                className={`tab-item${order === 'createdAt' ? ' active' : ''}`}
                href={isHomepage ? routes.issues() : routes.articleIssues(issueArticle.slug)}
              >
                <TimeIcon /> New
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'updatedAt' ? ' active' : ''}`}
                href={isHomepage ? routes.issues({ sort: 'updated' }) : routes.articleIssues(issueArticle.slug, { sort: 'updated' })}
              >
                <TimeIcon /> Updated
              </CustomLink>
              <CustomLink
                className={`tab-item${order === 'score' ? ' active' : ''}`}
                href={isHomepage ? routes.issues({ sort: 'score' }) : routes.articleIssues(issueArticle.slug, { sort: 'score' })}
              >
                <StarIcon /> Top
              </CustomLink>
            </>}
          </div>
        }
        {itemType === 'user'
          ? <UserList {...{
              loggedInUser,
              page,
              users,
              usersCount,
            }}/>
          : itemType === 'comment'
            ? <CommentList {...{
                comments,
                commentsCount,
                showAuthor: true,
                page,
              }}/>
            : <ArticleList {...{
              articles,
              articlesCount,
              followed,
              issueArticle,
              itemType,
              loggedInUser,
              page,
              showAuthor: true,
            }}/>
        }
        {pinnedArticle && <>
          <h2 className="content-not-ourbigbook pinned-article">
            <PinnedArticleIcon />
            {' '}
            Pinned article:
            {' '}
            <CustomLink 
              className={'link'}
              href={routes.article(pinnedArticle.slug)}
            >
              {pinnedArticle.slug}
            </CustomLink>
          </h2>
          <div
            className="ourbigbook"
            dangerouslySetInnerHTML={{ __html: pinnedArticle.render }}
          />
        </>}
        {isHomepage &&
          <div className="content-not-ourbigbook site-settings">
            <CustomLink href={routes.siteSettings()}>
              <SettingsIcon /> Site settings
            </CustomLink>
          </div>
        }
      </div>
    </>
  }
}

export default IndexPageHoc;
