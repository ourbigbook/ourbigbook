import Router, { useRouter } from 'next/router'
import Head from "next/head";
import React from "react";
import useSWR, { trigger } from "swr";

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the cirodown package.
//import { cirodown_runtime } from 'cirodown/cirodown_runtime.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js';

import Comment from "components/Comment";
import CommentInput from "components/CommentInput";
import CustomLink from "components/CustomLink";
import FavoriteArticleButton, { FavoriteArticleButtonContext } from "components/FavoriteArticleButton";
import LoadingSpinner from "components/LoadingSpinner";
import Maybe from "components/Maybe";
import UserLinkWithImage from "components/UserLinkWithImage";
import FollowUserButton, { FollowUserButtonContext } from "components/FollowUserButton";
import ArticleAPI from "lib/api/article";
import CommentAPI from "lib/api/comment";
import { formatDate } from "lib/utils/date";
import { ArticleType } from "lib/types/articleType";
import { CommentType } from "lib/types/commentType";
import fetcher from "lib/utils/fetcher";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

interface ArticlePageProps {
  article: ArticleType;
  comments: CommentType[];
  topicArticleCount: number;
}

function renderRefCallback(elem) {
  if (elem) {
    cirodown_runtime(elem);
  }
}

const ArticlePage = ({
  article,
  comments,
  topicArticleCount,
}: ArticlePageProps) => {
  const loggedInUser = getLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === article?.author?.username;
  const router = useRouter();

  // Fetch user-specific data.
  // Article determines if the curent user favorited the article or not
  const { data: articleApi, error } = useSWR(ArticleAPI.url(article?.slug), fetcher(router.isFallback));
  if (articleApi !== undefined) {
    article = articleApi.article
  }
  // We fetch comments so that the new posted comment will appear immediately after posted.
  // Note that we cannot calculate the exact new coment element because we need the server datetime.
  const { data: commentApi, error: commentError } = useSWR(CommentAPI.url(article?.slug), fetcher(router.isFallback));
  if (commentApi !== undefined) {
    comments = commentApi.comments
  }

  // TODO it is not ideal to have to setup state on every parent of FavoriteUserButton/FollowUserButton,
  // but I just don't know how to avoid it nicely, especially considering that the
  // button shows up on both profile and article pages, and thus comes from different
  // API data, so useSWR is not a clean.
  const [following, setFollowing] = React.useState(false)
  const [followerCount, setFollowerCount] = React.useState(article?.author.followerCount)
  const [favorited, setFavorited] = React.useState(false);
  const [score, setScore] = React.useState(article?.score);
  React.useEffect(() => {
    setFavorited(article?.favorited)
    setScore(article?.score)
    setFollowing(article?.author.following)
    setFollowerCount(article?.author.followerCount)
  }, [
    article?.favorited,
    article?.score,
    article?.author.following,
    article?.author.followerCount,
  ])

  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete this article?");
    if (!result) return;
    await ArticleAPI.delete(article.slug, loggedInUser?.token);
    trigger(ArticleAPI.url(article.slug));
    Router.push(`/`);
  };

  if (router.isFallback) { return <LoadingSpinner />; }
  const markup = { __html: article.render };
  return (
    <>
      <Head>
        <title>{article.title}</title>
      </Head>
      <div className="article-page">
        <div className="banner content-not-cirodown">
          <div className="article-meta">
            <div className="article-info">
              <UserLinkWithImage user={article.author} />
              {' '}
              <FollowUserButtonContext.Provider value={{
                following, setFollowing, followerCount, setFollowerCount
              }}>
                <FollowUserButton profile={article.author} showUsername={false} />
              </FollowUserButtonContext.Provider>
              <Maybe test={canModify}>
                <span>
                  <CustomLink
                    href={routes.articleEdit(article.slug)}
                    className="btn"
                  >
                    <i className="ion-edit" /> Edit
                  </CustomLink>
                  <button
                    className="btn"
                    onClick={handleDelete}
                  >
                    <i className="ion-trash-a" /> Delete
                  </button>
                </span>
              </Maybe>
            </div>
            <div className="article-info article-info-2">
              {topicArticleCount > 1 &&
                <CustomLink
                  href={routes.topicArticlesView(article.topicId)}
                >
                  <i className="ion-ios-people" /> Top articles by other authors about the same topic ({topicArticleCount})
                </CustomLink>
              }
            </div>
            <div className="article-actions">
              <FavoriteArticleButtonContext.Provider value={{
                favorited, setFavorited, score, setScore
              }}>
                <FavoriteArticleButton
                  article={article}
                  showText={false}
                />
              </FavoriteArticleButtonContext.Provider>
              {' Created: '}
              <span className="article-dates">
                {formatDate(article.createdAt)}
              </span>
              {article.createdAt !== article.updatedAt &&
                <>
                  {' Updated: '}
                  <span className="article-dates">
                    {formatDate(article.updatedAt)}
                  </span>
                </>
              }
            </div>
          </div>
        </div>
        <div className="container page">
          <div
            dangerouslySetInnerHTML={markup}
            className="cirodown"
            ref={renderRefCallback}
          />
          <div className="comments content-not-cirodown">
            <h1>Comments</h1>
            <div>
              <CommentInput />
              {comments?.map((comment: CommentType) => (
                <Comment key={comment.id} comment={comment} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArticlePage;

// Server only.

import { getStaticPathsArticle, getStaticPropsArticle } from "lib/article";
import { revalidate } from "config";

export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle(revalidate, true);;
