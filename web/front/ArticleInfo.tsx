import Router, { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import { webApi } from 'front/api'
import { formatDate } from 'front/date'
import LikeArticleButton from 'front/LikeArticleButton'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'

const ArticleInfo = ({
  article,
  isIssue=false,
  loggedInUser,
  issueArticle,
}:
{
  article?,
  isIssue?: boolean,
  loggedInUser?: UserType,
  issueArticle?: ArticleType,
}
) => {
  const canModify =
    loggedInUser && loggedInUser?.username === article?.author?.username;
  const [liked, setLiked] = React.useState(false);
  const [score, setScore] = React.useState(article?.score);
  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete this article?");
    if (!result) return;
    await webApi.articleDelete(article.slug);
    Router.push(`/`);
  };
  return <div className="article-info-3">
    <LikeArticleButton {...{
      article: article,
      loggedInUser,
      isIssue,
      issueArticle,
      showText: true,
    }} />
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
          href={isIssue ? routes.issueEdit(issueArticle.slug, article.number) : routes.articleEdit(article.slug)}
          className="btn"
        >
          <i className="ion-edit" /> <span className="shortcut">E</span>dit
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
    {isIssue &&
      <>
        {' '}
        <span className="see-all"><a href={routes.issues(issueArticle.slug)}><i className="ion-eye" /> Other discussions</a></span>
      </>
    }
  </div>
}
export default ArticleInfo
