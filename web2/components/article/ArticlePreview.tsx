import Link from "next/link";
import React from "react";

import CustomLink from "components/common/CustomLink";
import CustomImage from "components/common/CustomImage";
import FavoriteArticleButton from "components/common/FavoriteArticleButton";
import { usePageDispatch } from "lib/context/PageContext";
import { formatDate } from "lib/utils/date";

const ArticlePreview = ({ article }) => {
  const setPage = usePageDispatch();
  const preview = article;
  const [hover, setHover] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  if (!article) return;
  return (
    <tr>
      <td>
        <FavoriteArticleButton
          favorited={preview.favorited}
          favoritesCount={preview.favoritesCount}
          slug={preview.slug} />
      </td>
      <td>
        <CustomLink
          href="/profile/[pid]"
          as={`/profile/${preview.author.username}`}
        >
          <CustomImage
            src={preview.author.image}
            className="profile-thumb"
            alt="author profile image"
          />
          {' '}
          {preview.author.username}
        </CustomLink>
      </td>
      <td>
        <CustomLink
          href="/article/[pid]"
          as={`/article/${preview.slug}`}
          className="preview-link"
        >
          {preview.title}
        </CustomLink>
      </td>
      <td>{formatDate(preview.createdAt)}</td>
      <td>{formatDate(preview.updatedAt)}</td>
    </tr>
  );
};

export default ArticlePreview;
