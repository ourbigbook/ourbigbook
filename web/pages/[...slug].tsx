import { useRouter } from 'next/router'
import Head from "next/head";
import React from "react";
import useSWR, { trigger } from "swr";

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the cirodown package.
//import { cirodown_runtime } from 'cirodown/cirodown_runtime.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js';

import ArticleActions from "components/article/ArticleActions";
import Comment from "components/comment/Comment";
import CommentInput from "components/comment/CommentInput";
import CustomLink from "components/common/CustomLink";
import FavoriteArticleButton, { FavoriteArticleButtonContext } from "components/common/FavoriteArticleButton";
import LoadingSpinner from "components/common/LoadingSpinner";
import Maybe from "components/common/Maybe";
import UserLinkWithImage from "components/common/UserLinkWithImage";
import FollowUserButton, { FollowUserButtonContext } from "components/profile/FollowUserButton";
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
}

function renderRefCallback(elem) {
  if (elem) {
    cirodown_runtime(elem);
  }
}

const ArticlePage = ({ article, comments }: ArticlePageProps) => {
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
  React.useEffect(() => {
    setFollowing(article?.author.following)
  }, [article?.author.following])
  const [favorited, setFavorited] = React.useState(false);
  const [favoritesCount, setFavoritesCount] = React.useState(article?.favoritesCount);
  React.useEffect(() => {
    setFavorited(article?.favorited);
    setFavoritesCount(article?.favoritesCount)
  }, [article?.favorited, article?.favoritesCount])

  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete this article?");
    if (!result) return;
    await ArticleAPI.delete(slug, loggedInUser?.token);
    trigger(ArticleAPI.url(slug));
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
          <FavoriteArticleButtonContext.Provider value={{
            favorited, setFavorited, favoritesCount, setFavoritesCount
          }}>
            <FollowUserButtonContext.Provider value={{
              following, setFollowing
            }}>
              <div className="article-meta">
                <div className="article-info">
                  <UserLinkWithImage user={article.author} />
                  {' Created: '}
                  {formatDate(article.createdAt)}
                  {article.createdAt !== article.updatedAt &&
                    <>
                      {' '}
                      Updated: {formatDate(article.updatedAt)}
                    </>
                  }
                </div>
                <div className="article-info article-info-2">
                  <CustomLink
                    href={routes.topicArticlesView(article.topicId)}
                  >
                    <i className="ion-ios-people" /> View the top articles by other authors about the same topic
                  </CustomLink>
                </div>
                <div className="article-actions">
                  <FavoriteArticleButton
                    favorited={article.favorited}
                    favoritesCount={article.favoritesCount}
                    slug={article.slug}
                    showText={false}
                  />
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
                  <FollowUserButton profile={article.author} />
                </div>
              </div>
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
import { revalidate } from "config";

export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle(revalidate, true);;
