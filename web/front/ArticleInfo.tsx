import Router, { useRouter } from 'next/router'
import React from 'react'
import { trigger } from 'swr'

import CustomLink from 'front/CustomLink'
import ArticleAPI from 'front/api/article'
import { formatDate } from 'front/date'
import useLoggedInUser from 'front/useLoggedInUser'
import LikeArticleButton from 'front/LikeArticleButton'
import routes from 'front/routes'

const ArticleInfo = ({
  article,
}) => {
  const loggedInUser = useLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === article?.file?.author?.username;
  const [liked, setLiked] = React.useState(false);
  const [score, setScore] = React.useState(article?.score);
  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete this article?");
    if (!result) return;
    await ArticleAPI.delete(article.slug, loggedInUser?.token);
    trigger(ArticleAPI.url(article.slug));
    Router.push(`/`);
  };
  return <div className="article-info-3">
    <LikeArticleButton
      article={article}
      showText={true}
    />
    {' '}
    <span className="mobile-hide">
      {'Created: '}
      <span className="article-dates">
        {formatDate(article.createdAt)}
      </span>
    </span>
    {article.createdAt !== article.updatedAt &&
      <>
        <span className="mobile-hide">
          {' Updated: '}
        </span>
        <span className="article-dates">
          {formatDate(article.updatedAt)}
        </span>
      </>
    }
    {canModify && <>
      {' '}
      <span>
        <CustomLink
          href={routes.articleEdit(article.slug)}
          className="btn"
        >
          <i className="ion-edit" /> Edit
        </CustomLink>
        {false &&
          <button
            className="btn"
            onClick={handleDelete}
          >
            <i className="ion-trash-a" /> Delete
          </button>
        }
      </span>
    </>}
  </div>
}
export default ArticleInfo
