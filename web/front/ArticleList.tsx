import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import LoadingSpinner from 'front/LoadingSpinner'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { AppContext } from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'

export type ArticleListProps = {
  articles: ArticleType[];
  articlesCount: number;
  loggedInUser?: UserType,
  page: number;
  paginationUrlFunc: PaginationPropsUrlFunc;
  showAuthor: boolean;
  what: string;
}

const ArticleList = ({
  articles,
  articlesCount,
  comments,
  commentsCount,
  isIssue,
  issueArticle,
  loggedInUser,
  page,
  paginationUrlFunc,
  showAuthor,
  what
}: ArticleListProps) => {
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { like, follow, tag, uid } = query;


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
      case 'user-articles-top':
      case 'user-articles-latest':
        message = `${voice} published any articles yet.`
        break
      case 'top-followed':
      case 'latest-followed':
        message = `Follow some users to see their posts here.`
        break
      case 'top':
      case 'latest':
        message = (<>
          There are no articles on this website yet.
          Why don't you <a href={routes.articleNew()}>create a new one</a>?
        </>)
        break
      case 'issues':
        message = 'There are no issues for this article'
      default:
        message = 'There are no articles matching this search'
    }
    return <div className="article-preview">
      {message}
    </div>;
  }
  return (
    <div className="article-list-nav-container">
      <div className="article-list-container">
        <table className="article-list">
          <thead>
            <tr>
              <th className="shrink center">Score</th>
              <th className="expand">Title</th>
              {showAuthor &&
                <th className="shrink">Author</th>
              }
              <th className="shrink">Created</th>
              <th className="shrink">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles?.map((article, i) => (
              <tr key={isIssue ? article.number : article.slug}>
                <td className="shrink center">
                  <LikeArticleButton {...{
                    article,
                    isIssue,
                    loggedInUser,
                    showText: false,
                  }} />
                </td>
                <td className="expand title">
                  <CustomLink
                    href={isIssue ? routes.issueView(issueArticle.slug, article.number) : routes.articleView(article.slug)}
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
                <td className="shrink">{formatDate(article.createdAt)}</td>
                <td className="shrink">{formatDate(article.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginationUrlFunc &&
        <Pagination {...{
          articlesCount,
          articlesPerPage: articleLimit,
          showPagesMax: 10,
          currentPage: page,
          urlFunc: paginationUrlFunc,
        }} />
      }
    </div>
  );
};

export default ArticleList;
