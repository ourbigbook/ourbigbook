import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import LoadingSpinner from 'front/LoadingSpinner'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { AppContext, ArticleIcon, TimeIcon, UserIcon } from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { CommentType } from 'front/types/CommentType'
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
  itemType?: string;
  loggedInUser?: UserType,
  page: number;
  paginationUrlFunc?: PaginationPropsUrlFunc;
  showAuthor: boolean;
  what?: string;
}

const ArticleList = ({
  articles,
  articlesCount,
  comments,
  commentsCount,
  followed=false,
  itemType='article',
  issueArticle,
  loggedInUser,
  page,
  paginationUrlFunc,
  showAuthor,
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
            Why don't you <a href={isIssue ? routes.issueNew(issueArticle.slug) : routes.articleNew()}>create a new one</a>?
          </>)
        }
        break
      default:
        message = 'There are no articles matching this search'
    }
    return <div className="article-preview">
      {message}
    </div>;
  }
  return (
    <div className="list-nav-container">
      <div className="list-container">
        <table className="list">
          <thead>
            <tr>
              {itemType === 'topic' ?
                <th className="shrink right">Articles</th>
                :
                <th className="shrink center">Score</th>
              }
              <th className="expand"><ArticleIcon /> Title</th>
              {showAuthor &&
                <th className="shrink"><UserIcon /> Author</th>
              }
              {isIssue &&
                <th className="shrink">
                  #
                </th>
              }
              <th className="shrink"><TimeIcon /> Created</th>
              <th className="shrink"><TimeIcon /> Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles?.map((article, i) => (
              <tr key={itemType === 'issue' ? article.number : itemType === 'article' ? article.slug : article.topicId}>
                {itemType === 'topic' ?
                  <td className="shrink right bold">
                    {article.articleCount}
                  </td>
                  :
                  <td className="shrink center">
                    <LikeArticleButton {...{
                      article,
                      isIssue,
                      issueArticle,
                      loggedInUser,
                      showText: false,
                    }} />
                  </td>
                }
                <td className="expand title">
                  <CustomLink
                    href={itemType === 'issue' ? routes.issue(issueArticle.slug, article.number) :
                          itemType === 'article' ? routes.article(article.slug) :
                          routes.topic(article.topicId, { sort: 'score' })
                    }
                  >
                    <div
                      className="comment-body ourbigbook-title"
                      dangerouslySetInnerHTML={{ __html: article.titleRender }}
                    />
                  </CustomLink>
                </td>
                {showAuthor &&
                  <td className="shrink">
                    <UserLinkWithImage showUsername={false} user={article.author} />
                  </td>
                }
                {isIssue &&
                  <td className="shrink bold">
                    <CustomLink
                      href={isIssue ? routes.issue(issueArticle.slug, article.number) : routes.article(article.slug)}
                    >
                      #{article.number}
                    </CustomLink>
                  </td>
                }
                <td className="shrink">{formatDate(article.createdAt)}</td>
                <td className="shrink">{formatDate(article.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginationUrlFunc &&
        <Pagination {...{
          currentPage: page,
          what: isIssue ? 'threads' : 'articles',
          itemsCount: articlesCount,
          itemsPerPage: articleLimit,
          urlFunc: paginationUrlFunc,
        }} />
      }
    </div>
  );
};

export default ArticleList;
