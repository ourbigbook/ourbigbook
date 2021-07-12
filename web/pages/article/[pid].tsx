import marked from "marked";
import { useRouter } from 'next/router'
import Head from "next/head";
import React from "react";
import useSWR  from "swr";

import { cirodown_runtime } from 'cirodown/cirodown.runtime.js';

import ArticleMeta from "components/article/ArticleMeta";
import Comment from "components/comment/Comment";
import CommentInput from "components/comment/CommentInput";
import { FavoriteArticleButtonContext } from "components/common/FavoriteArticleButton";
import LoadingSpinner from "components/common/LoadingSpinner";
import { FollowUserButtonContext } from "components/profile/FollowUserButton";
import ArticleAPI from "lib/api/article";
import { ArticleType } from "lib/types/articleType";
import { CommentType } from "lib/types/commentType";
import { SERVER_BASE_URL } from "lib/utils/constant";
import fetcher from "lib/utils/fetcher";

interface ArticlePageProps {
  article: ArticleType;
  comments: CommentType[];
  pid: string;
}

function renderRefCallback(elem) {
  if (elem) {
    cirodown_runtime(elem);
  }
}

const ArticlePage = ({ article, comments }: ArticlePageProps) => {
  const router = useRouter();
  if (router.isFallback) { return <LoadingSpinner />; }

  // Fetch user-specific data.
  // Article determines if the curent user favorited the article or not
  const { data: articleApi, error } = useSWR(`${SERVER_BASE_URL}/articles/${article.slug}`, fetcher);
  if (articleApi !== undefined) {
    article = articleApi.article
  }
  // We fetch comments so that the new posted comment will appear immediately after posted.
  // Note that we cannot calculate the exact new coment element because we need the server datetime.
  const { data: commentApi, error: commentError } = useSWR(`${SERVER_BASE_URL}/articles/${article.slug}/comments`, fetcher);
  if (commentApi !== undefined) {
    comments = commentApi.comments
  }

  // TODO it is not ideal to have to setup state on every parent of FavoriteUserButton/FollowUserButton,
  // but I just don't know how to avoid it nicely, especially considering that the
  // button shows up on both profile and article pages, and thus comes from different
  // API data, so useSWR is not a clean.
  const [following, setFollowing] = React.useState(false)
  React.useEffect(() => {
    setFollowing(article.author.following)
  }, [article.author.following])
  const [favorited, setFavorited] = React.useState(false);
  const [favoritesCount, setFavoritesCount] = React.useState(article.favoritesCount);
  React.useEffect(() => {
    setFavorited(article.favorited);
  }, [article.favorited])

  const markup = { __html: article.render };
  return (
    <>
      <Head>
        <title>{article.title}</title>
      </Head>
      <div className="article-page">
        <div className="banner content-not-cirodown">
          <FavoriteArticleButtonContext.Provider value={{
            favorited, setFavorited, favoritesCount, setFavoritesCount
          }}>
            <FollowUserButtonContext.Provider value={{
              following, setFollowing
            }}>
              <ArticleMeta article={article}/>
            </FollowUserButtonContext.Provider>
          </FavoriteArticleButtonContext.Provider>
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
const configModule = require("../../config");

export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle(configModule.revalidate, true);
