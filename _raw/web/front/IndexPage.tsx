import React from 'react'

import pluralize from 'pluralize'

import {
  ArticleIcon,
  capitalize,
  CommentIcon,
  DiscussionAbout,
  IssueIcon,
  MyHead,
  NewArticleIcon,
  orderToPageTitle,
  PinnedArticleIcon,
  SettingsIcon,
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
                    <ArticleIcon /> New followed
                  </CustomLink>
                  <CustomLink
                    className={`tab-item${itemType === 'article' && order === 'updatedAt' && followed ? ' active' : ''}`}
                    href={routes.articlesFollowed({ sort: 'updated' })}
                  >
                    <ArticleIcon /> Updated followed
                  </CustomLink>
                  <CustomLink
                    className={`tab-item${itemType === 'article' && order === 'score' && followed ? ' active' : ''}`}
                    href={routes.articlesFollowed({ sort: 'score' })}
                  >
                    <ArticleIcon /> Top followed
                  </CustomLink>
                </>
              }
              <CustomLink
                className={`tab-item${itemType === 'article' && order === 'score' && !followed ? ' active' : ''}`}
                href={(!isHomepage) ? routes.articleIssues(issueArticle.slug, { sort: 'score' }) : routes.articles({ sort: 'score' })}
              >
                <ArticleIcon /> Top<span className="mobile-hide"> articles</span>
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'article' && order === 'createdAt' && !followed ? ' active' : ''}`}
                href={(!isHomepage) ? routes.articleIssues(issueArticle.slug, { sort: 'created' }) : routes.articles()}
              >
                <ArticleIcon /> New<span className="mobile-hide"> articles</span>
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'article' && order === 'updatedAt' && !followed ? ' active' : ''}`}
                href={(!isHomepage) ? routes.articleIssues(issueArticle.slug, { sort: 'updated' }) : routes.articles({ sort: 'updated' })}
              >
                <ArticleIcon /> Updated<span className="mobile-hide"> articles</span>
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'user' && order === 'score' ? ' active' : ''}`}
                href={routes.users({ sort: 'score' })}
              >
                <UserIcon /> Top users
              </CustomLink>
              <CustomLink
                className={`tab-item${itemType === 'user' && order === 'createdAt' ? ' active' : ''}`}
                href={routes.users({ sort: 'created' })}
              >
                <UserIcon /> New users
              </CustomLink>
            </>
          }
          <CustomLink
            className={`tab-item${itemType === 'discussion' && order === 'createdAt' ? ' active' : ''}`}
            href={isHomepage ? routes.issues() : routes.articleIssues(issueArticle.slug)}
          >
            <IssueIcon /> New<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            className={`tab-item${itemType === 'discussion' && order === 'score' ? ' active' : ''}`}
            href={isHomepage ? routes.issues({ sort: 'score' }) : routes.articleIssues(issueArticle.slug, { sort: 'score' })}
          >
            <IssueIcon /> Top<span className="mobile-hide"> discussions</span>
          </CustomLink>
          <CustomLink
            className={`tab-item${itemType === 'comment' && order === 'createdAt' ? ' active' : ''}`}
            href={isHomepage ? routes.comments({ sort: 'created' }) : routes.articleComments(issueArticle.slug, { sort: 'created' })}
          >
            <CommentIcon /> New<span className="mobile-hide"> comments</span>
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
