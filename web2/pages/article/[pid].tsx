import marked from "marked";
import React from "react";
import { useRouter } from 'next/router'
import useSWR  from "swr";

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

const ArticlePage = ({ article, comments }: ArticlePageProps) => {
  const router = useRouter();
  if (router.isFallback) { return <LoadingSpinner />; }
  const { data: articleApi, error } = useSWR(`${SERVER_BASE_URL}/articles/${article.slug}`, fetcher);
  if (articleApi !== undefined) {
    article = articleApi.article
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

  const markup = { __html: marked(article.body) };
  return (
    <div className="article-page">
      <div className="banner">
        <div className="container">
          <h1>{article.title}</h1>
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
      </div>
      <div className="container page">
        <div className="row article-content">
          <div className="col-md-12">
            <div dangerouslySetInnerHTML={markup} />
            <ul className="tag-list">
              {article.tagList?.map((tag) => (
                <li className="tag-default tag-pill tag-outline" key={tag}>{tag}</li>
              ))}
            </ul>
          </div>
        </div>
        <hr />
        <div className="article-actions">
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
        <div className="row">
          <div className="col-xs-12 col-md-8 offset-md-2">
            <div>
              <CommentInput />
              {comments?.map((comment: CommentType) => (
                <Comment key={comment.id} comment={comment} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArticlePage;

// Server only.

import { getStaticPathsArticle, getStaticPropsArticle } from "lib/article";
const configModule = require("../../config");

export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle(configModule.revalidate, true);
