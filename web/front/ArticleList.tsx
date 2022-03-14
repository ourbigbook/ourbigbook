import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton, { LikeArticleButtonContext } from 'front/LikeArticleButton'
import LoadingSpinner from 'front/LoadingSpinner'
import Pagination from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { AppContext } from 'front'
import { DEFAULT_LIMIT } from 'constant'
import { formatDate } from 'date'
import getLoggedInUser from 'getLoggedInUser'
import routes from 'routes'

type Options = {
  articles: undefined;
  articlesCount: undefined;
  paginationUrlFunc?: undefined;
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
  const loggedInUser = getLoggedInUser()
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

  // Like article button state.
  const liked = []
  const setLiked = []
  const score = []
  const setScore = []
  for (let i = 0; i < DEFAULT_LIMIT; i++) {
    [liked[i], setLiked[i]] = React.useState(articles[i]?.liked);
    [score[i], setScore[i]] = React.useState(articles[i]?.score);
  }
  React.useEffect(() => {
    for (let i = 0; i < articles.length; i++) {
      setLiked[i](articles[i].liked);
      setScore[i](articles[i].score);
    }
  }, Object.assign(articles.map(a => a.liked).concat(articles.map(a => a.score)), {length: DEFAULT_LIMIT}))
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
    <div className="article-list-container">
      <table className="article-list">
        <thead>
          <tr>
            {showAuthor &&
              <th className="shrink">Author</th>
            }
            <th className="shrink">Score</th>
            <th className="expand">Title</th>
            <th className="shrink">Created</th>
            <th className="shrink">Updated</th>
          </tr>
        </thead>
        <tbody>
          {articles?.map((article, i) => (
            <tr key={article.slug}>
              {showAuthor &&
                <td className="shrink">
                  <UserLinkWithImage user={article.author} />
                </td>
              }
              <td className="shrink">
                <LikeArticleButtonContext.Provider key={article.slug} value={{
                  liked: liked[i],
                  setLiked: setLiked[i],
                  score: score[i],
                  setScore: setScore[i],
                }}>
                  <LikeArticleButton
                    article={article}
                    showText={false}
                  />
                </LikeArticleButtonContext.Provider>
              </td>
              <td className="expand title">
                <CustomLink
                  href={routes.articleView(article.slug)}
                  className="preview-link"
                >
                  {article.title}
                </CustomLink>
              </td>
              <td className="shrink">{formatDate(article.createdAt)}</td>
              <td className="shrink">{formatDate(article.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination {...{
        articlesCount,
        articlesPerPage: DEFAULT_LIMIT,
        showPagesMax: 10,
        currentPage,
        urlFunc: paginationUrlFunc,
      }} />
    </div>
  );
};

export default ArticleList;
