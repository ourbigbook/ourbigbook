import Router, { useRouter } from "next/router";
import React from "react";
import { trigger } from "swr";

import FavoriteArticleButton from "components/common/FavoriteArticleButton";
import FollowUserButton from "components/profile/FollowUserButton";
import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import ArticleAPI from "lib/api/article";
import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const ArticleActions = ({ article }) => {
  const loggedInUser = getLoggedInUser()
  const router = useRouter();
  const {
    query: { pid },
  } = router;
  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete it?");
    if (!result) return;
    await ArticleAPI.delete(pid, loggedInUser?.token);
    trigger(`${SERVER_BASE_URL}/articles/${pid}`);
    Router.push(`/`);
  };
  const canModify =
    loggedInUser && loggedInUser?.username === article?.author?.username;
  return (
    <>
      <Maybe test={!canModify}>
        <span>
          <FavoriteArticleButton
            favorited={article.favorited}
            favoritesCount={article.favoritesCount}
            slug={article.slug}
            showText={false}
          />
          <FollowUserButton profile={article.author} />
        </span>
      </Maybe>
      <Maybe test={canModify}>
        <span>
          <CustomLink
            href="/editor/[pid]"
            as={`/editor/${article.slug}`}
            className="btn btn-outline-secondary btn-sm"
          >
            <i className="ion-edit" /> Edit Article
          </CustomLink>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={handleDelete}
          >
            <i className="ion-trash-a" /> Delete Article
          </button>
        </span>
      </Maybe>
    </>
  );
};

export default ArticleActions;
