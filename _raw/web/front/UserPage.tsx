import { useRouter } from 'next/router'
import Link from 'next/link'
import React from 'react'

import pluralize from 'pluralize'

import { formatNumberApprox } from 'ourbigbook'

import {
  ArticleIcon,
  ChildrenIcon,
  CommentIcon,
  IncomingIcon,
  DiscussionIcon,
  LikeIcon,
  MyHead,
  SettingsIcon,
  StarIcon,
  UserIcon,
  TagIcon,
  orderToPageTitle,
  useEEdit,
  TimeIcon,
  FollowIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  AlphabeticalOrderTabTitle,
  AnnounceIcon,
  LockIcon,
} from 'front'
import ArticleList from 'front/ArticleList'
import CommentList from 'front/CommentList'
import { cant } from 'front/cant'
import config from 'front/config'
import CustomLink from 'front/CustomLink'
import CustomImage from 'front/CustomImage'
import LoadingSpinner from 'front/LoadingSpinner'
import LogoutButton from 'front/LogoutButton'
import FollowUserButton from 'front/FollowUserButton'
import { DisplayAndUsername, displayAndUsernameText } from 'front/user'
import routes from 'front/routes'
import Article from 'front/Article'
import UserList from 'front/UserList'
import { ArticleType, ArticleLinkType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
import { CommonPropsType } from 'front/types/CommonPropsType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'
import LockUserButton from 'front/LockUserButton'
import BlacklistSignupIpButton from './BlacklistSignupIpButton'
import UnlistAllArticlesButton from './UnlistAllArticlesButton'

export interface UserPageProps extends CommonPropsType {
  ancestors?: ArticleLinkType[];
  article?: ArticleType & IssueType;
  articles?: (ArticleType & IssueType & TopicType)[];
  articlesCount?: number;
  articlesInSamePage?: ArticleType[];
  articlesInSamePageCount?: number;
  articlesInSamePageForToc?: ArticleType[];
  articlesInSamePageForTocCount?: number;
  commentCountByLoggedInUser?: number;
  comments?: CommentType[];
  commentsCount?: number;
  hasListedArticle?: boolean;
  hasUnlisted?: boolean;
  incomingLinks?: ArticleLinkType[];
  issuesCount?: number;
  itemType?: 'article' | 'comment' | 'discussion' | 'like'| 'topic' | 'user';
  latestIssues?: IssueType[];
  list: boolean,
  order: string;
  orderAscDesc: string;
  page: number;
  // For when listed articles are relative to another article,
  // e.g. tagged by, incoming links or children.
  parentArticle?: ArticleLinkType;
  // Always false if its not admin querying.
  signupIpIsBlacklisted: boolean;
  synonymLinks?: ArticleLinkType[];
  tagged?: ArticleLinkType[];
  topIssues?: IssueType[];
  totalArticlesByUser: number;
  totalCommentsByUser: number;
  totalDiscussionsByUser: number;
  user: UserType;
  users?: UserType[];
  usersCount?: number;
  what:
    'followed' |
    'followed-articles' |
    'followed-discussions' |
    'follows' |
    'home' |
    'liked' |
    'liked-discussions' |
    'likes' |
    'likes-discussions' |
    'user-articles' |
    'user-child-articles' |
    'user-incoming-articles' |
    'user-tagged-articles' |
    'user-comments' |
    'user-issues'
  ;
}

export default function UserPage({
  article,
  articles,
  articlesCount,
  articlesInSamePage,
  articlesInSamePageCount,
  articlesInSamePageForToc,
  articlesInSamePageForTocCount,
  ancestors,
  comments,
  commentsCount,
  commentCountByLoggedInUser,
  hasListedArticle,
  hasUnlisted,
  incomingLinks,
  issuesCount,
  itemType,
  latestIssues,
  list,
  loggedInUser,
  order,
  orderAscDesc,
  page,
  parentArticle,
  signupIpIsBlacklisted,
  synonymLinks,
  tagged,
  topIssues,
  totalArticlesByUser,
  totalCommentsByUser,
  totalDiscussionsByUser,
  user,
  users,
  usersCount,
  what,
}: UserPageProps) {
  const router = useRouter();
  const username = user?.username
  const isCurrentUser = loggedInUser && username === loggedInUser?.username
  const canEdit = loggedInUser && loggedInUser?.username === username
  useEEdit(canEdit, article?.slug)

  // Following state.
  const [following, setFollowing] = React.useState(false)
  const [followerCount, setFollowerCount] = React.useState(user?.followerCount)
  React.useEffect(() => {
    setFollowing(user?.following)
    setFollowerCount(user?.followerCount)
  }, [
    user?.following,
    user?.followerCount,
  ])

  // title
  const displayAndUsername = displayAndUsernameText(user)
  let title2
  switch (what) {
    case 'followed':
      title2 = 'Newly followed by'
      break;
    case 'follows':
      title2 = 'New follows'
      break;
    case 'liked':
      title2 = `New received likes`
      break;
    case 'likes':
    case 'likes-discussions':
      title2 = `Newly liked ${pluralize(itemType)}`
      break;
    case 'followed-articles':
    case 'followed-discussions':
      title2 = `Newly followed ${pluralize(itemType)}`
      break;
    default:
      if (itemType) {
        title2 = `${orderToPageTitle(order)} ${pluralize(itemType)}`
      }
  }
  const title = `${displayAndUsername} ${title2 ? ` - ${title2}` : ''}`

  const handleShortFragmentSkipOnce = React.useRef(false)
  if (router.isFallback) { return <LoadingSpinner />; }
  const statuses = []
  if (user.admin) {
    statuses.push(<a href={`${config.docsAdminUrl}`}><StarIcon /> Admin</a>)
  }
  if (user.locked) {
    statuses.push(<a href={`${config.docsAccountLockingUrl}`}><LockIcon /> Locked</a>)
  }
  return <>
    <MyHead title={title} />
    <div className="profile-page">
      <div className="user-info content-not-ourbigbook">
        <div className="name-and-image">
          <div className="no-image">
            <h1>
              <a href={routes.user(username)}>
                <DisplayAndUsername user={user} showParenthesis={false} />
              </a>
            </h1>
            {statuses.length !== 0 && <div className="statuses">{
              statuses.map((status, i) => <div className="h2 inline" key={i}>{status}</div>)}
            </div>}
            <div className="user-actions">
              <FollowUserButton {...{ loggedInUser, user, showUsername: false }}/>
              <CustomLink className="btn" href={routes.issueNew(`${username}`)}>
                <DiscussionIcon /> Message
              </CustomLink>
              {!cant.viewUserSettings(loggedInUser, user) &&
                <CustomLink
                  href={routes.userEdit(username)}
                  className="btn btn-sm btn-outline-secondary action-btn"
                >
                  <SettingsIcon /> Settings
                </CustomLink>
              }
              {!cant.setUserLimits(loggedInUser, user) &&
                <LockUserButton {...{ username, on: user.locked }} />
              }
              {(!cant.setUserLimits(loggedInUser, user) && user.ip) &&
                <BlacklistSignupIpButton {...{ ip: user.ip, on: signupIpIsBlacklisted }} />
              }
              {!cant.setUserLimits(loggedInUser, user) &&
                <UnlistAllArticlesButton {...{ username, on: !hasListedArticle }} />
              }
              {isCurrentUser &&
                <LogoutButton />
              }
            </div>
          </div>
          <a href={routes.user(username)}>
            <CustomImage
              src={user.effectiveImage}
              alt="User's profile image"
              className="user-img"
            />
          </a>
        </div>
        {parentArticle
          ? <div className="parent-article">
              <h2>{
                  what === 'user-child-articles' ? <><ChildrenIcon /> Children</> :
                  what === 'user-incoming-articles' ? <><IncomingIcon /> Incoming links</> :
                  what === 'user-tagged-articles' ? <><TagIcon /> Tagged</> :
                  (() => { throw new Error("TODO shit's bugged") })()
                }:
                {' '}
                <Link href={routes.article(parentArticle.slug)}>
                  <span
                    className="ourbigbook-title title"
                    dangerouslySetInnerHTML={{ __html: parentArticle.titleRenderWithScope }}
                  />
                </Link>
              </h2>
            </div>
          : <>
              <div className="tab-list">
                <CustomLink
                  href={routes.userArticles(username, { sort: 'created' })}
                  className={`tab-item${itemType === 'article' ? ' active' : ''}`}
                >
                  <ArticleIcon /> Articles<span className="mobile-hide"> ({ formatNumberApprox(totalArticlesByUser) })</span>
                </CustomLink>
                <CustomLink
                  href={routes.userIssues(username, { sort: 'created' })}
                  className={`tab-item${itemType === 'discussion' ? ' active' : ''}`}
                >
                  <DiscussionIcon /> Discussions<span className="mobile-hide"> ({ formatNumberApprox(totalDiscussionsByUser) })</span>
                </CustomLink>
                <CustomLink
                  href={routes.userComments(username, { sort: 'created' })}
                  className={`tab-item${itemType === 'comment' ? ' active' : ''}`}
                >
                  <CommentIcon /> Comments<span className="mobile-hide"> ({ formatNumberApprox(totalCommentsByUser) })</span>
                </CustomLink>
                <CustomLink
                  href={routes.userFollows(username)}
                  className={`tab-item${itemType === 'user' ? ' active' : ''}`}
                >
                  <UserIcon /> Follows
                </CustomLink>
                <CustomLink
                  href={routes.userLiked(username)}
                  className={`tab-item${what === 'liked' ? ' active' : ''}`}
                >
                  <LikeIcon /> Received<span className="mobile-hide"> likes</span>
                </CustomLink>
                {false &&
                  // TODO https://github.com/ourbigbook/ourbigbook/issues/313
                  <CustomLink
                    href={routes.userLikedDiscussions(username)}
                    className={`tab-item${what === 'liked-discussions' ? ' active' : ''}`}
                  >
                    <LikeIcon /><DiscussionIcon /> Received<span className="mobile-hide"> discussion likes</span>
                  </CustomLink>
                }
              </div>
              <div className="tab-list">
                {itemType === 'article' && <>
                  <CustomLink
                    href={routes.userArticles(username, { sort: 'created' })}
                    className={`tab-item${what === 'user-articles' && order === 'createdAt' ? ' active' : ''}`}
                  >
                    <TimeIcon /> New
                  </CustomLink>
                  <CustomLink
                    href={routes.userArticles(username, { sort: 'updated' })}
                    className={`tab-item${what === 'user-articles' && order === 'updatedAt' ? ' active' : ''}`}
                  >
                    <TimeIcon /> Updated
                  </CustomLink>
                  <CustomLink
                    href={routes.userArticles(username, { sort: 'score' })}
                    className={`tab-item${what === 'user-articles' && order === 'score' ? ' active' : ''}`}
                  >
                    <StarIcon /> Top
                  </CustomLink>
                  <CustomLink
                    href={routes.userArticles(username, { sort: 'announced' })}
                    className={`tab-item${what === 'user-articles' && order === 'announced' ? ' active' : ''}`}
                  >
                    <AnnounceIcon /> Announced
                  </CustomLink>
                  <CustomLink
                    className={`tab-item${order === 'topicId' ? ' active' : ''}`}
                    href={routes.userArticles(username, { sort: 'id' })}
                  >
                    <ArticleIcon /> <AlphabeticalOrderTabTitle />
                  </CustomLink>
                  <CustomLink
                    href={routes.userLikes(username)}
                    className={`tab-item${what === 'likes' ? ' active' : ''}`}
                  >
                    <LikeIcon /> Liked
                  </CustomLink>
                  <CustomLink
                    href={routes.userFollowsArticles(username)}
                    className={`tab-item${what === 'followed-articles' ? ' active' : ''}`}
                  >
                    <FollowIcon /> Followed
                  </CustomLink>
                </>}
                {itemType === 'discussion' && <>
                  <CustomLink
                    href={routes.userIssues(username, { sort: 'created' })}
                    className={`tab-item${what === 'user-issues' && order === 'createdAt' ? ' active' : ''}`}
                  >
                    <TimeIcon /> New
                  </CustomLink>
                  <CustomLink
                    href={routes.userIssues(username, { sort: 'updated' })}
                    className={`tab-item${what === 'user-issues' && order === 'updatedAt' ? ' active' : ''}`}
                  >
                    <TimeIcon /> Updated
                  </CustomLink>
                  <CustomLink
                    href={routes.userIssues(username, { sort: 'score' })}
                    className={`tab-item${what === 'user-issues' && order === 'score' ? ' active' : ''}`}
                  >
                    <StarIcon /> Top
                  </CustomLink>
                  <CustomLink
                    href={routes.userLikesDiscussions(username)}
                    className={`tab-item${what === 'likes-discussions' ? ' active' : ''}`}
                  >
                    <LikeIcon /> Liked
                  </CustomLink>
                  <CustomLink
                    href={routes.userFollowsDiscussions(username)}
                    className={`tab-item${what === 'followed-discussions' ? ' active' : ''}`}
                  >
                    <FollowIcon /> Followed
                  </CustomLink>
                </>}
                {itemType === 'user' && <>
                  <CustomLink
                    href={routes.userFollows(username)}
                    className={`tab-item${what === 'follows' ? ' active' : ''}`}
                  >
                    <ArrowRightIcon /> Follows
                  </CustomLink>
                  <CustomLink
                    href={routes.userFollowed(username)}
                    className={`tab-item${what === 'followed' ? ' active' : ''}`}
                  >
                    <ArrowLeftIcon /> Followed by
                  </CustomLink>
                </>}
              </div>
            </>
          }
      </div>
      {what === 'home' &&
        <Article {...{
          ancestors,
          article,
          articlesInSamePage,
          articlesInSamePageCount,
          articlesInSamePageForToc,
          articlesInSamePageForTocCount,
          comments,
          commentCountByLoggedInUser,
          handleShortFragmentSkipOnce,
          incomingLinks,
          isIndex: true,
          issuesCount,
          latestIssues,
          loggedInUser,
          synonymLinks,
          tagged,
          topIssues,
        }}/>
      }
    </div>
    {(itemType === 'article' || itemType === 'discussion' || itemType === 'like') &&
      <ArticleList {...{
        articles,
        articlesCount,
        handleShortFragmentSkipOnce,
        hasUnlisted,
        itemType,
        list,
        loggedInUser,
        page,
        showAuthor: what === 'likes' || what === 'followed-articles',
        what,
      }}/>
    }
    {itemType === 'comment' &&
      <CommentList {...{
        comments,
        commentsCount,
        page,
        showAuthor: false,
      }}/>
    }
    {itemType === 'user' &&
      <UserList {...{
        loggedInUser,
        page,
        users,
        usersCount,
      }}/>
    }
  </>
}
