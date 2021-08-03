import Router, { useRouter } from "next/router";
import React from "react";
import { trigger } from "swr";

import FavoriteArticleButton from "components/common/FavoriteArticleButton";
import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import FollowUserButton from "components/profile/FollowUserButton";
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
            href={`/editor/${article.slug}`}
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
  );
};

export default ArticleActions;
