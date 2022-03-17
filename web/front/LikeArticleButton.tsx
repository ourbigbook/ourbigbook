import React from 'react'
import Router from 'next/router'

import ArticleAPI from 'front/api/article'
import { buttonActiveClass } from 'front/config'
import useLoggedInUser from 'front/useLoggedInUser'
import routes from 'routes'

const LikeArticleButton = ({
  article,
  showText,
}) => {
  const loggedInUser = useLoggedInUser()
  const currentUserIsAuthor = article?.author.username === loggedInUser?.username
  const [liked, setLiked] = React.useState(article.liked)
  const [score, setScore] = React.useState(article.score)
  let buttonText;
  let buttonTextMaybe;
  if (liked) {
    buttonTextMaybe = 'Unlike'
  } else {
    buttonTextMaybe = 'Like'
  }
  if (showText) {
    buttonText = ' ' + buttonTextMaybe
  } else {
    buttonText = ''
  }
  const handleClickLike = async (e) => {
    e.preventDefault();
    if (currentUserIsAuthor) return
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    setLiked(!liked)
    setScore(score + (liked ? - 1 : 1))
    try {
      if (liked) {
        await ArticleAPI.unlike(article.slug, loggedInUser?.token)
      } else {
        await ArticleAPI.like(article.slug, loggedInUser?.token)
      }
    } catch (error) {
      setLiked(!liked)
      setScore(score + (liked ? 1 : -1))
    }
  };
  let count = score;
  if (showText) {
    count = (<span className="counter">({count})</span>)
  }
  let buttonClassName;
  let title;
  if (currentUserIsAuthor) {
    buttonClassName = 'disabled'
    title = 'You cannot like your own articles'
  } else {
    buttonClassName = liked ? buttonActiveClass : ''
    title = buttonTextMaybe + ' this article'
  }
  return (
    <button
      className={buttonClassName}
      onClick={handleClickLike}
      title={title}
    >
      <i className="ion-heart" />{showText ? ' ' : ''}{buttonText}
      {' '}{count}
    </button>
  )
}

export default LikeArticleButton;
