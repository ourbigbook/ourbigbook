import Router, { useRouter } from 'next/router'
import React from 'react'
import Link from 'next/link'

import lodash from 'lodash'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import ShowBody from 'front/ShowBody'
import UserLinkWithImage from 'front/UserLinkWithImage'
import {
  ArticleIcon,
  IssueIcon,
  LikeIcon,
  TimeIcon,
  UnlistedIcon,
  UserIcon,
  getShortFragFromLongForPath,
  shortFragGoTo,
} from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'

import { QUERY_FALSE_VAL, QUERY_TRUE_VAL } from 'ourbigbook/web_api'
import {
  AT_MENTION_CHAR,
} from 'ourbigbook'

function getKey(
  itemType: string,
  article,
  issueArticle=undefined
) {
  if (itemType === 'discussion') {
    let curIssueArticle
    if (issueArticle) {
      curIssueArticle = issueArticle
    } else {
      curIssueArticle = article.article
    }
    return `${article.number}/${curIssueArticle.slug}`
  } else {
    return itemType === 'article' ? article.slug :
           itemType === 'like' ? `${article.likedBy.username}/${article.slug}` :
           article.topicId
  }
}

export type ArticleListProps = {
  // TODO not ideal. Only Articles are really possible. This is to appease ArticleList.
  articles: (ArticleType & IssueType & TopicType)[];
  articlesCount: number;
  followed?: boolean;
  handleShortFragmentSkipOnce?: React.MutableRefObject<boolean>;
  hasUnlisted?: boolean;
  issueArticle?: ArticleType;
  itemType?: 'article' | 'discussion' | 'like' | 'topic';
  list?: boolean;
  loggedInUser?: UserType,
  page?: number;
  paginationUrlFunc?: PaginationPropsUrlFunc;
  showAuthor: boolean;
  showBody?: boolean,
  showControls?: boolean;
  what?: string;
}

const ArticleList = ({
  articles,
  articlesCount,
  followed=false,
  itemType='article',
  handleShortFragmentSkipOnce,
  hasUnlisted,
  issueArticle,
  list,
  loggedInUser,
  page,
  paginationUrlFunc,
  showAuthor,
  showBody=false,
  showControls=true,
  what='all',
}: ArticleListProps) => {
  const router = useRouter();
  const { query } = router
  const { uid } = query;
  const itemTypeHasShowBody = itemType === 'article'
    // This almost works to have discussion body previews. The only missing problem is that
    // "render" contains full body including h1 which we don't want. We'd need to convert
    // render to be body without h1 like in Article for it to work well.
    // || itemType === 'discussion'
  let showBodyInit
  if (itemTypeHasShowBody) {
    if (query.body === QUERY_TRUE_VAL) {
      showBodyInit = true
    } else if (query.body === QUERY_FALSE_VAL) {
      showBodyInit = false
    } else {
      showBodyInit = showBody
    }
  } else {
    showBodyInit = false
  }
  const [showBodyState, setShowBodyState] = React.useState(showBodyInit)

  let isIssue
  switch (itemType) {
    case 'discussion':
      isIssue = true
      break
    case 'topic':
      showAuthor = false
      break
  }
  let pagination
  let emptyMessage
  if (articles.length === 0) {
    let voice
    if (loggedInUser?.username === uid) {
      voice = "You have not"
    } else {
      voice = "This user has not"
    }
    switch (what) {
      case 'likes':
        emptyMessage = `${voice} liked any articles yet.`
        break
      case 'user-articles':
        emptyMessage = `${voice} published any articles yet.`
        break
      case 'all':
        if (followed) {
          emptyMessage = `Follow some users to see their posts here.`
        } else {
          emptyMessage = <>
            There are no {isIssue ? 'discussions' : 'articles'} on this {isIssue ? 'article' : 'website'} yet.
            Why don't you <CustomLink href={isIssue ? routes.issueNew(issueArticle.slug) : routes.articleNew()}>create a new one</CustomLink>?
          </>
        }
        break
      default:
        emptyMessage = `There are currently no matching ${isIssue ? 'discussions' : 'articles'}.`
    }
  } else {
    if (showControls) {
      pagination = <Pagination {...{
        currentPage: page,
        what: isIssue ? 'discussions' : itemType === 'like' ? 'likes' : itemType === 'topic' ? 'topics' : 'articles',
        itemsCount: articlesCount,
        itemsPerPage: articleLimit,
        urlFunc: paginationUrlFunc,
      }} />
    } else {
      pagination = <></>
    }
  }
  const aElemToMetaMap = React.useRef(new Set())
  return (
    <div className={`article-list`}>
      { articles.length === 0
        ? <div className="list-container content-not-ourbigbook">
            {emptyMessage}
          </div>
        : <div className="list-nav-container">
            {showControls &&
              <div className="content-not-ourbigbook controls">
                {itemTypeHasShowBody && <ShowBody {...{ setShowBodyState, showBody, showBodyInit }}/>}
              </div>
            }
            {showBodyState && pagination}
            <div className="content-not-ourbigbook">
              <div className={`list-container${showBodyState ? ' show-body' : '' }`}>
                {showBodyState
                  ? articles?.map((article, i) => {
                      let curIssueArticle
                      if (issueArticle) {
                        curIssueArticle = issueArticle
                      } else {
                        curIssueArticle = article.article
                      }
                      return (
                        <div
                          key={getKey(itemType, article) }
                          className="item"
                        >
                          <div className={`item-header content-not-ourbigbook${article.render ? '' : ' empty-body'}`}>
                            <LikeArticleButton {...{
                              article,
                              isIssue,
                              issueArticle,
                              loggedInUser,
                              showText: false,
                            }} />
                            {' '}
                            <CustomLink
                              href={itemType === 'discussion' ? routes.issue(curIssueArticle.slug, article.number) :
                                    itemType === 'article' ? routes.article(article.slug) :
                                    routes.topic(article.topicId, { sort: 'score' })
                              }
                            >
                              <span
                                className="ourbigbook-title title"
                                dangerouslySetInnerHTML={{ __html: article.titleRender }}
                              />
                            </CustomLink>
                            {' '}
                            {showAuthor &&
                              <>
                                by
                                {' '}
                                <UserLinkWithImage showUsername={false} user={article.author} />
                                {' '}
                              </>
                            }
                            on{' '}
                            <span title="Last updated" className="item-date">
                              <TimeIcon />
                              {' '}
                              {formatDate(article.updatedAt)}
                            </span>
                          </div>
                          {article.render &&
                            <div
                              className="item-body ourbigbook"
                              dangerouslySetInnerHTML={{ __html: article.render }}
                              ref={(elem) => {
                                if (elem) {
                                  const as = elem.getElementsByTagName('a')
                                  for (let i = 0; i < as.length; i++) {
                                    const a = as[i]
                                    if (!aElemToMetaMap.current.has(a)) {
                                      const href = a.href
                                      aElemToMetaMap.current.add(a)
                                      const url = new URL(href, document.baseURI)
                                      if (
                                        // Don't do processing for external links.
                                        url.origin === new URL(document.baseURI).origin
                                      ) {
                                        let frag
                                        let longFrag
                                        let goToTargetInPage = false
                                        let targetElem
                                        if (url.hash) {
                                          frag = url.hash.slice(1)
                                          targetElem = document.getElementById(frag)
                                          longFrag = AT_MENTION_CHAR + frag
                                          if (targetElem) {
                                            goToTargetInPage = true
                                            a.href = '#' + longFrag
                                          }
                                        }
                                        if (!goToTargetInPage) {
                                          const frag = getShortFragFromLongForPath(url.hash.slice(1), url.pathname.slice(1))
                                          a.href = url.pathname + (frag ? ('#' + frag) : '')
                                        }
                                        a.addEventListener('click', e => {
                                          if (
                                            // Don't capture Ctrl + Click, as that means user wants link to open on a separate page.
                                            // https://stackoverflow.com/questions/16190455/how-to-detect-controlclick-in-javascript-from-an-onclick-div-attribute
                                            !e.ctrlKey
                                          ) {
                                            e.preventDefault()
                                            if (
                                              // This is needed to prevent a blowup when clicking the "parent" link of a direct child of the toplevel page of an issue.
                                              // For artiles all works fine because each section is rendered separately and thus has a non empty href.
                                              // But issues currently work more like static renderings, and use empty ID for the toplevel header. This is even though
                                              // the toplevel header does have already have an ID. We should instead of doing this actually make those hrefs correct.
                                              // But lazy now.
                                              !href
                                            ) {
                                              window.location.hash = ''
                                            } else {
                                              if (goToTargetInPage) {
                                                shortFragGoTo(handleShortFragmentSkipOnce, frag, longFrag, targetElem)
                                              } else {
                                                Router.push(a.href)
                                              }
                                            }
                                          }
                                        })
                                      }
                                    }
                                  }
                                }
                              }}
                            />
                          }
                          <div className="item-footer content-not-ourbigbook">
                            <CustomLink
                              href={itemType === 'discussion' ? routes.issue(curIssueArticle.slug, article.number) :
                                    itemType === 'article' ? routes.article(article.slug) :
                                    routes.topic(article.topicId, { sort: 'score' })
                              }
                            >
                              <ArticleIcon /> Read the full article
                            </CustomLink>
                          </div>
                        </div>
                      )})
                  : <table className="list">
                      <thead>
                        <tr>
                          {itemType === 'like' &&
                            <>
                              <th className="shrink"><LikeIcon /><TimeIcon /> Liked</th>
                              <th className="shrink"><LikeIcon /><UserIcon /> Liked By</th>
                            </>
                          }
                          {itemType === 'topic' &&
                            <th className="shrink right">Articles</th>
                          }
                          {(() => {
                              const score = itemType === 'topic'
                                ? <></>
                                : <th className="shrink center"><LikeIcon /> Score</th>
                              const title = <>
                                {isIssue &&
                                  <th className="shrink">
                                    <span className="icon">#</span> id
                                  </th>
                                }
                                <th className="expand">{ itemType === 'discussion' ? <IssueIcon /> : <ArticleIcon /> } Title</th>
                              </>
                              if (itemType === 'like') {
                                return <>{title}{score}</>
                              } else {
                                return <>{score}{title}</>
                              }
                            })()
                          }
                          {showAuthor &&
                            <th className="shrink"><UserIcon /> Author</th>
                          }
                          {(itemType !== 'topic') &&
                            <th className="shrink"><IssueIcon /> { isIssue ? 'Comments' : 'Discussions' }</th>
                          }
                          <th className="shrink"><TimeIcon /> Created</th>
                          <th className="shrink"><TimeIcon /> Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articles?.map(article => {
                          let curIssueArticle
                          if (issueArticle) {
                            curIssueArticle = issueArticle
                          } else {
                            curIssueArticle = article.article
                          }
                          const mainHref =
                                itemType === 'article' || itemType === 'like' ? routes.article(article.slug) :
                                itemType === 'discussion' ? routes.issue(curIssueArticle.slug, article.number) :
                                itemType === 'topic' ? routes.topic(article.topicId, { sort: 'score' }) :
                                null
                          return <tr
                            key={getKey(itemType, article, issueArticle) }
                          >
                            {itemType === 'like' &&
                              <>
                                <td className="shrink right">{formatDate(article.likedByDate)}</td>
                                <td className="shrink ">
                                  <UserLinkWithImage showUsername={false} user={article.likedBy} />
                                </td>
                              </>
                            }
                            {(itemType === 'topic') &&
                              <td className="shrink right bold">
                                <CustomLink href={mainHref}>{article.articleCount}</CustomLink>
                              </td>
                            }
                            {(() => {
                              const score = <>
                                {(itemType === 'topic')
                                  ? <></>
                                  : <td className="shrink center like">
                                      <LikeArticleButton {...{
                                        article,
                                        isIssue,
                                        issueArticle: curIssueArticle,
                                        loggedInUser,
                                        showText: false,
                                      }} />
                                    </td>
                                }
                              </>
                              const title = <>
                                {isIssue &&
                                  <td className="shrink bold">
                                    <CustomLink href={mainHref}>{issueArticle ? '' : curIssueArticle.slug }#{article.number}</CustomLink>
                                  </td>
                                }
                                <td className="expand bold">
                                  <CustomLink href={mainHref} >
                                    <span
                                      className="ourbigbook-title"
                                      dangerouslySetInnerHTML={{ __html: article.titleRender }}
                                    />
                                  </CustomLink>
                                </td>
                              </>
                              if (itemType === 'like') {
                                return <>{title}{score}</>
                              } else {
                                return <>{score}{title}</>
                              }
                            })()}
                            {showAuthor &&
                              <td className="shrink">
                                <UserLinkWithImage showUsername={false} user={article.author} />
                              </td>
                            }
                            {(itemType !== 'topic') &&
                              <td className="shrink right bold">
                                <CustomLink href={isIssue ? routes.issueComments(curIssueArticle.slug, article.number) : routes.issues(article.slug)}>
                                  {isIssue ? article.commentCount : article.issueCount}
                                </CustomLink>
                              </td>
                            }
                            <td className="shrink">{formatDate(article.createdAt)}</td>
                            <td className="shrink">{formatDate(article.updatedAt)}</td>
                          </tr>
                        })}
                      </tbody>
                    </table>
                }
              </div>
            </div>
            {pagination}
          </div>
      }
      {(itemType === 'article' && hasUnlisted === true) &&
        <p className="content-not-ourbigbook">
          <UnlistedIcon />{' '}
          {list === true
            ? <>
                There are unlisted articles,
                {' '}
                <Link
                  href={{
                      pathname: router.pathname,
                      query: { ...router.query, 'show-unlisted': QUERY_TRUE_VAL },
                  }}
                >
                  also show them
                </Link>
                {' '}or{' '}
                <Link
                  href={{
                      pathname: router.pathname,
                      query: { ...router.query, 'show-unlisted': QUERY_TRUE_VAL, 'show-listed': QUERY_FALSE_VAL },
                  }}
                >
                  only show them
                </Link>.
              </>
            : <>
                {list === false ? 'Only unlisted articles are being shown' : 'Unlisted articles are being shown'},
                {' '}
                <Link
                  href={{
                      pathname: router.pathname,
                      query: lodash.omit(router.query, 'show-unlisted', 'show-listed'),
                  }}
                >
                  click here to show only listed articles
                </Link>.
              </>
          }
        </p>
      }
    </div>
  )
}

export default ArticleList;
