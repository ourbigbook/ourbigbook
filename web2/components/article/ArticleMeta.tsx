import React from "react";

import ArticleActions from "components/article/ArticleActions";
import CustomLink from "components/common/CustomLink";
import UserLinkWithImage from "components/common/UserLinkWithImage";
import { formatDate } from "lib/utils/date";

const ArticleMeta = ({ article }) => {
  if (!article) return;
  console.error(article.createdAt);
  console.error(article.updatedAt);
  return (
    <div className="article-meta">
      <div className="article-info">
        <UserLinkWithImage user={article.author} />
        {' '}
        {formatDate(article.createdAt)}
        {article.createdAt !== article.updatedAt &&
          <>
            {' '}
            Updated: {formatDate(article.updatedAt)}
          </>
        }
      </div>
      <ArticleActions article={article} />
    </div>
  );
};

export default ArticleMeta;
