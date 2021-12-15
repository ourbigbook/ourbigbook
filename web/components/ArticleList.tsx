import { useRouter } from "next/router";
import React from "react";
import useSWR from "swr";

import CustomLink from "components/CustomLink";
import ErrorMessage from "components/ErrorMessage";
import LikeArticleButton, { LikeArticleButtonContext } from "components/LikeArticleButton";
import LoadingSpinner from "components/LoadingSpinner";
import Maybe from "components/Maybe";
import Pagination from "components/Pagination";
import UserLinkWithImage from "components/UserLinkWithImage";
import { AppContext } from "lib";
import { SERVER_BASE_URL, DEFAULT_LIMIT } from "lib/utils/constant";
import { formatDate } from "lib/utils/date";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const ArticleList = (props) => {
  const [page, setPage] = React.useState(0)
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { like, follow, tag, uid } = query;
  let fetchURL = (() => {
    switch (props.what) {
      case 'likes':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&liked=${encodeURIComponent(
          String(uid)
        )}&offset=${page * DEFAULT_LIMIT}`
      case 'user-articles-top':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&author=${encodeURIComponent(
          String(uid)
        )}&offset=${page * DEFAULT_LIMIT}&sort=score`;
      case 'user-articles-latest':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&author=${encodeURIComponent(
          String(uid)
        )}&offset=${page * DEFAULT_LIMIT}`;
      case 'tag':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&tag=${encodeURIComponent(props.tag)}&offset=${
          page * DEFAULT_LIMIT
        }`;
      case 'followed-latest':
        return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
          page * DEFAULT_LIMIT
        }`;
      case 'followed-top':
        return `${SERVER_BASE_URL}/articles/feed?limit=${DEFAULT_LIMIT}&offset=${
          page * DEFAULT_LIMIT
        }&sort=score`;
      case 'global-latest':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&offset=${page * DEFAULT_LIMIT}`;
      case 'global-top':
        return `${SERVER_BASE_URL}/articles?limit=${DEFAULT_LIMIT}&offset=${page * DEFAULT_LIMIT}&sort=score`;
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

  // Like article button state.
  const liked = []
  const setLiked = []
  const score = []
  const setScore = []
  for (let i = 0; i < DEFAULT_LIMIT; i++) {
    [liked[i], setLiked[i]] = React.useState(false);
    [score[i], setScore[i]] = React.useState(0);
  }
  React.useEffect(() => {
    for (let i = 0; i < articles.length; i++) {
      setLiked[i](articles[i].liked);
      setScore[i](articles[i].score);
    }
  }, [articles])

  if (error) return <ErrorMessage message="Cannot load recent articles..." />;
  if (!data) return <div className="article-preview">Loading articles...</div>;
  if (articles?.length === 0) {
    let message;
    let voice;
    if (loggedInUser.username === uid) {
      voice = "You have not"
    } else {
      voice = "This user has not"
    }
    switch (props.what) {
      case 'likes':
        message = `${voice} liked any articles yet`
        break
      case 'user-articles-top':
      case 'user-articles-latest':
        message = `${voice} published any articles yet`
        break
      case 'followed-latest':
      case 'followed-top':
        message = `You haven't followed anybody yet`
        break
      case 'tag':
        message = `There are no articles with the tag: ${props.tag}`
        break
      case 'global-top':
      case 'global-latest':
        message = 'There are no articles on this website yet'
        break
      default:
        message = 'There are no articles matching this search'
    }
    return (<div className="article-preview">
      {message}.
    </div>);
  }
  let showAuthor;
  if (props.what === 'user-articles-top' || props.what === 'user-articles-latest') {
    showAuthor = false
  } else {
    showAuthor = true
  }
  return (
    <>
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
        <Maybe test={articlesCount && articlesCount > 20}>
          <Pagination
            articlesCount={articlesCount}
            articlesPerPage={DEFAULT_LIMIT}
            showPagesMax={10}
            currentPage={page}
            setCurrentPage={setPage}
            fetchURL={fetchURL}
          />
        </Maybe>
      </div>
    </>
  );
};

export default ArticleList;
