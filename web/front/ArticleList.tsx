import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { ArticleIcon, IssueIcon, LikeIcon, TimeIcon, UserIcon } from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { IssueType } from 'front/types/IssueType'
import { TopicType } from 'front/types/TopicType'
import { UserType } from 'front/types/UserType'

export type ArticleListProps = {
  articles: (ArticleType & IssueType & TopicType)[];
  articlesCount: number;
  comments?: Comment[];
  commentsCount?: number;
  followed?: boolean;
  issueArticle?: ArticleType;
  itemType?: 'article' | 'discussion' | 'like' | 'topic';
  loggedInUser?: UserType,
  page: number;
  paginationUrlFunc?: PaginationPropsUrlFunc;
  showAuthor: boolean;
  showBody?: boolean,
  what?: string;
}

const ArticleList = ({
  articles,
  articlesCount,
  followed=false,
  itemType='article',
  issueArticle,
  loggedInUser,
  page,
  paginationUrlFunc,
  showAuthor,
  showBody=false,
  what='all',
}: ArticleListProps) => {
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { like, follow, tag, uid } = query;
  let isIssue
  switch (itemType) {
    case 'discussion':
      isIssue = true
      break
    case 'topic':
      showAuthor = false
      break
  }
  if (articles.length === 0) {
    let message;
    let voice;
    if (loggedInUser?.username === uid) {
      voice = "You have not"
    } else {
      voice = "This user has not"
    }
    switch (what) {
      case 'likes':
        message = `${voice} liked any articles yet.`
        break
      case 'user-articles':
        message = `${voice} published any articles yet.`
        break
      case 'all':
        if (followed) {
          message = `Follow some users to see their posts here.`
        } else {
          message = (<>
            There are no {isIssue ? 'discussions' : 'articles'} on this {isIssue ? 'article' : 'website'} yet.
            Why don't you <CustomLink href={isIssue ? routes.issueNew(issueArticle.slug) : routes.articleNew()}>create a new one</CustomLink>?
          </>)
        }
        break
      default:
        message = `There are no ${isIssue ? 'discussions' : 'articles'} matching this search`
    }
    return <div className="article-preview">
      {message}
    </div>;
  }
  let pagination
  if (paginationUrlFunc) {
    pagination = <Pagination {...{
        currentPage: page,
        what: isIssue ? 'discussions' : itemType === 'like' ? 'likes' : 'articles',
        itemsCount: articlesCount,
        itemsPerPage: articleLimit,
        urlFunc: paginationUrlFunc,
      }} />
    if (showBody) {
      pagination = <div className="content-not-ourbigbook">{pagination}</div>
    }
  } else {
    pagination = <></>
  }
  return (
    <div className="list-nav-container">
      {showBody && pagination}
      <div className="list-container">
        {showBody
          ? articles?.map((article, i) => (
              <div
                key={itemType === 'discussion' ? article.number : itemType === 'article' ? article.slug : article.topicId}
                className="item"
              >
                <div className="content-not-ourbigbook title-container">
                  <LikeArticleButton {...{
                    article,
                    isIssue,
                    issueArticle,
                    loggedInUser,
                    showText: false,
                  }} />
                  {' '}
                  <CustomLink
                    href={itemType === 'discussion' ? routes.issue(issueArticle.slug, article.number) :
                          itemType === 'article' ? routes.article(article.slug) :
                          routes.topic(article.topicId, { sort: 'score' })
                    }
                  >
                    <span
                      className="comment-body ourbigbook-title title"
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
                  <span title="Last updated">
                    <TimeIcon />
                    {' '}
                    {formatDate(article.updatedAt)}
                  </span>
                </div>
                <div
                  className="ourbigbook"
                  dangerouslySetInnerHTML={{ __html: article.render }}
                />
                <div className="content-not-ourbigbook read-full">
                  <CustomLink
                    href={itemType === 'discussion' ? routes.issue(issueArticle.slug, article.number) :
                          itemType === 'article' ? routes.article(article.slug) :
                          routes.topic(article.topicId, { sort: 'score' })
                    }
                  >
                    <ArticleIcon /> Read the full article
                  </CustomLink>
                </div>
              </div>
            ))
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
                            # id
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
                {articles?.map((article, i) => {
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
                    key={
                      itemType === 'discussion'
                        ? `${article.number}/${curIssueArticle.slug}` :
                        itemType === 'article'
                          ? article.slug :
                            article.topicId
                    }>
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
                        <td className="expand title">
                          <CustomLink href={mainHref} >
                            <span
                              className="comment-body ourbigbook-title"
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
      {pagination}
    </div>
  );
};

export default ArticleList;
