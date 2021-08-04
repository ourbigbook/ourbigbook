import { useRouter } from "next/router";
import React from "react";
import useSWR from "swr";

import ArticlePreview from "components/article/ArticlePreview";
import ErrorMessage from "components/common/ErrorMessage";
import { FavoriteArticleButtonContext } from "components/common/FavoriteArticleButton";
import LoadingSpinner from "components/common/LoadingSpinner";
import Maybe from "components/common/Maybe";
import Pagination from "components/common/Pagination";
import { usePageState } from "lib/context/PageContext";
import {
  usePageCountState,
  usePageCountDispatch,
} from "lib/context/PageCountContext";
import { SERVER_BASE_URL, DEFAULT_LIMIT } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";

const ArticleList = (props) => {
  const page = usePageState();
  const pageCount = usePageCountState();
  const setPageCount = usePageCountDispatch();
  const lastIndex =
    pageCount > 480 ? Math.ceil(pageCount / DEFAULT_LIMIT) : Math.ceil(pageCount / DEFAULT_LIMIT) - 1;
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { favorite, follow, tag, pid } = query;
  let fetchURL = (() => {
    switch (props.what) {
      case 'favorites':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&favorited=${encodeURIComponent(
          String(pid)
        )}&offset=${page * DEFAULT_LIMIT}`
      case 'my-posts':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&author=${encodeURIComponent(
          String(pid)
        )}&offset=${page * DEFAULT_LIMIT}`;
      case 'tag':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&tag=${encodeURIComponent(props.tag)}&offset=${
          page * DEFAULT_LIMIT
        }`;
      case 'feed':
        return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
          page * DEFAULT_LIMIT
        }`;
      case 'global':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&offset=${page * DEFAULT_LIMIT}`;
      default:
        throw new Error(`Unknown search: ${props.what}`)
    }
  })()
  const { data, error } = useSWR(fetchURL, fetcher());
  const { articles, articlesCount } = data || {
    articles: [],
    articlesCount: 0,
  };
  React.useEffect(() => {
    setPageCount(articlesCount);
  }, [articlesCount]);

  // Favorite article button state.
  const favorited = []
  const setFavorited = []
  const favoritesCount = []
  const setFavoritesCount = []
  for (let i = 0; i < DEFAULT_LIMIT; i++) {
    [favorited[i], setFavorited[i]] = React.useState(false);
    [favoritesCount[i], setFavoritesCount[i]] = React.useState(0);
  }
  React.useEffect(() => {
    for (let i = 0; i < articles.length; i++) {
      setFavorited[i](articles[i].favorited);
      setFavoritesCount[i](articles[i].favoritesCount);
    }
  }, [articles])

  if (error) return <ErrorMessage message="Cannot load recent articles..." />;
  if (!data) return <div className="article-preview">Loading articles...</div>;
  if (articles?.length === 0) {
    let message;
    switch (props.what) {
      case 'favorites':
        message = "Favorite some articles to see them here"
        break
      case 'my-posts':
        message = "Your articles will appear here"
        break
      case 'tag':
        message = `There are no articles with the tag: ${props.tag}`
        break
      case 'feed':
        message = 'Follow some users to see their articles here'
        break
      case 'global':
        message = 'There are no articles on this website yet'
        break
      default:
        message = 'There are no articles matching this search'
    }
    return (<div className="article-preview">
      {message}.
    </div>);
  }
  return (
    <>
      <div className="article-list-container">
        <table className="article-list">
          <thead>
            <tr>
              <th className="shrink">Author</th>
              <th className="shrink">Score</th>
              <th className="expand">Title</th>
              <th className="shrink">Created</th>
              <th className="shrink">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles?.map((article, i) => (
              <FavoriteArticleButtonContext.Provider key={article.slug} value={{
                favorited: favorited[i],
                setFavorited: setFavorited[i],
                favoritesCount: favoritesCount[i],
                setFavoritesCount: setFavoritesCount[i],
              }}>
                <ArticlePreview key={article.slug} article={article} />
              </FavoriteArticleButtonContext.Provider>
            ))}
          </tbody>
        </table>
        <Maybe test={articlesCount && articlesCount > 20}>
          <Pagination
            total={pageCount}
            limit={DEFAULT_LIMIT}
            pageCount={10}
            currentPage={page}
            lastIndex={lastIndex}
            fetchURL={fetchURL}
          />
        </Maybe>
      </div>
    </>
  );
};

export default ArticleList;
