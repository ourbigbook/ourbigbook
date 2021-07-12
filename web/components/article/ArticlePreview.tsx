import Link from "next/link";
import React from "react";

import CustomLink from "components/common/CustomLink";
import FavoriteArticleButton from "components/common/FavoriteArticleButton";
import { usePageDispatch } from "lib/context/PageContext";
import { formatDate } from "lib/utils/date";
import UserLinkWithImage from "components/common/UserLinkWithImage";

const ArticlePreview = ({ article }) => {
  const setPage = usePageDispatch();
  const preview = article;
  const [hover, setHover] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  if (!article) return;
  return (
    <tr>
      <td className="shrink">
        <UserLinkWithImage user={preview.author} />
      </td>
      <td className="shrink">
        <FavoriteArticleButton
          favorited={preview.favorited}
          favoritesCount={preview.favoritesCount}
          slug={preview.slug} />
      </td>
      <td className="expand title">
        <CustomLink
          href="/article/[pid]"
          as={`/article/${preview.slug}`}
          className="preview-link"
        >
          {preview.title}
        </CustomLink>
      </td>
      <td className="shrink">{formatDate(preview.createdAt)}</td>
      <td className="shrink">{formatDate(preview.updatedAt)}</td>
    </tr>
  );
};

export default ArticlePreview;
