import React from "react";

import ArticleActions from "components/article/ArticleActions";
import CustomLink from "components/common/CustomLink";
import UserLinkWithImage from "components/common/UserLinkWithImage";
import FollowUserButton from "components/profile/FollowUserButton";
import { formatDate } from "lib/utils/date";

const ArticleMeta = ({ article }) => {
  if (!article) return;
  console.error(article.createdAt);
  console.error(article.updatedAt);
  return (
    <div className="article-meta">
      <UserLinkWithImage user={article.author} />
      <FollowUserButton profile={article.author} />
      <div className="info">
        Created: <span className="date">{formatDate(article.createdAt)}</span>
        {article.createdAt !== article.updatedAt &&
          <>
            {' '}
            Updated: <span className="date">{formatDate(article.updatedAt)}</span>
          </>
        }
      </div>
      <ArticleActions article={article} />
    </div>
  );
};

export default ArticleMeta;
