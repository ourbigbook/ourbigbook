import { useRouter } from "next/router";
import React from "react";
import useSWR from "swr";

import CustomLink from "components/common/CustomLink";
import ErrorMessage from "components/common/ErrorMessage";
import FavoriteArticleButton, { FavoriteArticleButtonContext } from "components/common/FavoriteArticleButton";
import LoadingSpinner from "components/common/LoadingSpinner";
import Maybe from "components/common/Maybe";
import Pagination from "components/common/Pagination";
import UserLinkWithImage from "components/common/UserLinkWithImage";
import { usePageDispatch, usePageState } from "lib/context/PageContext";
import {
  usePageCountState,
  usePageCountDispatch,
} from "lib/context/PageCountContext";
import { SERVER_BASE_URL, DEFAULT_LIMIT } from "lib/utils/constant";
import { formatDate } from "lib/utils/date";
import fetcher from "lib/utils/fetcher";
import routes from "routes";

const ArticleList = (props) => {
  const page = usePageState();
  const pageCount = usePageCountState();
  const setPage = usePageDispatch();
  const setPageCount = usePageCountDispatch();
  const lastIndex =
    pageCount > 480 ? Math.ceil(pageCount / DEFAULT_LIMIT) : Math.ceil(pageCount / DEFAULT_LIMIT) - 1;
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { favorite, follow, tag, uid } = query;
  let fetchURL = (() => {
    switch (props.what) {
      case 'favorites':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&favorited=${encodeURIComponent(
          String(uid)
        )}&offset=${page * DEFAULT_LIMIT}`
      case 'my-articles-top':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&author=${encodeURIComponent(
          String(uid)
        )}&offset=${page * DEFAULT_LIMIT}&sort=score`;
      case 'my-articles-latest':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&author=${encodeURIComponent(
          String(uid)
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
      case 'topic-articles':
      case 'topic-users': // TODO top users for a topic.
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&offset=${page * DEFAULT_LIMIT}&topicId=${props.topicId}&sort=score`;
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
  const score = []
  const setScore = []
  for (let i = 0; i < DEFAULT_LIMIT; i++) {
    [favorited[i], setFavorited[i]] = React.useState(false);
    [score[i], setScore[i]] = React.useState(0);
  }
  React.useEffect(() => {
    for (let i = 0; i < articles.length; i++) {
      setFavorited[i](articles[i].favorited);
      setScore[i](articles[i].score);
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
              <th className="shrink">Score</th>
              <th className="shrink">Author</th>
              <th className="expand">Title</th>
              <th className="shrink">Created</th>
              <th className="shrink">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles?.map((article, i) => (
              <tr key={article.slug}>
                <td className="shrink">
                  <FavoriteArticleButtonContext.Provider key={article.slug} value={{
                    favorited: favorited[i],
                    setFavorited: setFavorited[i],
                    score: score[i],
                    setScore: setScore[i],
                  }}>
                    <FavoriteArticleButton
                      favorited={article.favorited}
                      score={article.score}
                      slug={article.slug}
                    />
                  </FavoriteArticleButtonContext.Provider>
                </td>
                <td className="shrink">
                  <UserLinkWithImage user={article.author} />
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
