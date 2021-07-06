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
    <div className="article-preview">
      <div className="article-meta">
        <CustomLink
          href="/profile/[pid]"
          as={`/profile/${preview.author.username}`}
        >
          <CustomImage
            src={preview.author.image}
            alt="author's profile image"
          />
        </CustomLink>
        <div className="info">
          <CustomLink
            href="/profile/[pid]"
            as={`/profile/${preview.author.username}`}
            className="author"
          >
            <span onClick={() => setPage(0)}>{preview.author.username}</span>
          </CustomLink>
          <span className="date">
            {formatDate(preview.createdAt)}
          </span>
        </div>
        <div className="pull-xs-right">
          <FavoriteArticleButton
            favorited={preview.favorited}
            favoritesCount={preview.favoritesCount}
            slug={preview.slug} />
        </div>
      </div>
      <CustomLink
        href="/article/[pid]"
        as={`/article/${preview.slug}`}
        className="preview-link"
      >
        <h1>{preview.title}</h1>
        <span>Read more...</span>
        <ul className="tag-list">
          {preview.tagList.map((tag, index) => {
            return (
              <Link href={`/?tag=${tag}`} as={`/?tag=${tag}`} key={index}>
                <li
                  className="tag-default tag-pill tag-outline"
                  onClick={(e) => e.stopPropagation()}
                  onMouseOver={() => {
                    setHover(true);
                    setCurrentIndex(index);
                  }}
                  onMouseLeave={() => {
                    setHover(false);
                    setCurrentIndex(-1);
                  }}
                >
                  {tag}
                </li>
              </Link>
            );
          })}
        </ul>
      </CustomLink>
    </div>
  );
};

export default ArticlePreview;
