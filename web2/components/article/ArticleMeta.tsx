import React from "react";

import ArticleActions from "components/article/ArticleActions";
import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import { formatDate } from "lib/utils/date";

const ArticleMeta = ({ article }) => {
  if (!article) return;
  return (
    <div className="article-meta">
      <CustomLink
        href="/profile/[pid]"
        as={`/profile/${encodeURIComponent(article.author?.username)}`}
      >
        <CustomImage
          src={article.author?.image}
          alt="author-profile-image"
        />
      </CustomLink>
      <div className="info">
        <CustomLink
          href="/profile/[pid]"
          as={`/profile/${encodeURIComponent(article.author?.username)}`}
          className="author"
        >
          {article.author?.username}
        </CustomLink>
        <span className="date">{formatDate(article.createdAt)}</span>
      </div>
      <ArticleActions article={article} />
    </div>
  );
};

export default ArticleMeta;
