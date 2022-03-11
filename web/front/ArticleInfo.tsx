import React from 'react'

import CustomLink from 'components/CustomLink'
import getLoggedInUser from 'lib/utils/getLoggedInUser'
import { formatDate } from 'lib/utils/date'
import LikeArticleButton, { LikeArticleButtonContext } from 'components/LikeArticleButton'
import routes from 'routes'

const ArticleInfo = ({
  article,
  comments,
}) => {
  const loggedInUser = getLoggedInUser()
  const canModify =
    loggedInUser && loggedInUser?.username === article?.author?.username;
  const [liked, setLiked] = React.useState(false);
  const [score, setScore] = React.useState(article?.score);
  React.useEffect(() => {
    setLiked(article?.liked)
    setScore(article?.score)
  }, [
    article?.liked,
    article?.score,
  ])
  const handleDelete = async () => {
    if (!loggedInUser) return;
    const result = window.confirm("Do you really want to delete this article?");
    if (!result) return;
    await ArticleAPI.delete(article.slug, loggedInUser?.token);
    trigger(ArticleAPI.url(article.slug));
    Router.push(`/`);
  };
  return <div className="article-info-3">
    <LikeArticleButtonContext.Provider value={{
      liked, setLiked, score, setScore
    }}>
      <LikeArticleButton
        article={article}
        showText={true}
      />
    </LikeArticleButtonContext.Provider>
    {' Created: '}
    <span className="article-dates">
      {formatDate(article.createdAt)}
    </span>
    {article.createdAt !== article.updatedAt &&
      <>
        {' Updated: '}
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
        <button
          className="btn"
          onClick={handleDelete}
        >
          <i className="ion-trash-a" /> Delete
        </button>
      </span>
    </>}
  </div>
}
export default ArticleInfo
