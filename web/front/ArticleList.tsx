import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import LoadingSpinner from 'front/LoadingSpinner'
import Pagination from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { AppContext } from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'date'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'front/routes'

type Options = {
  articles: undefined;
  articlesCount: undefined;
  showAuthor: undefined;
  what: undefined;
}

const ArticleList = ({
  articles,
  articlesCount,
  paginationUrlFunc,
  showAuthor,
  what
}) => {
  const loggedInUser = useLoggedInUser()
  const router = useRouter();
  const {
    query: { page },
  } = router;
  let currentPage
  if (page === undefined) {
    currentPage = 0
  } else {
    currentPage = parseInt(page as string, 10) - 1
  }
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
          {loggedInUser && <> Why don't you <a href={routes.articleNew()}>create a new one</a>?</>}
        </>)
        break
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
              <tr key={article.slug}>
                <td className="shrink center">
                  <LikeArticleButton
                    article={article}
                    showText={false}
                  />
                </td>
                <td className="expand title">
                  <CustomLink
                    href={routes.articleView(article.slug)}
                    className="preview-link"
                  >
                    {article.title}
                  </CustomLink>
                </td>
                {showAuthor &&
                  <td className="shrink">
                    <UserLinkWithImage showUsername={false} user={article.file.author} />
                  </td>
                }
                <td className="shrink">{formatDate(article.createdAt)}</td>
                <td className="shrink">{formatDate(article.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...{
        articlesCount,
        articlesPerPage: articleLimit,
        showPagesMax: 10,
        currentPage,
        urlFunc: paginationUrlFunc,
      }} />
    </div>
  );
};

export default ArticleList;
