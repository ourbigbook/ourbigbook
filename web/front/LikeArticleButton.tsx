import React from 'react'
import Router from 'next/router'

import { articleApi } from 'front/api'
import { buttonActiveClass } from 'front/config'
import routes from 'front/routes'

const LikeArticleButton = ({
  article,
  loggedInUser,
  showText,
}) => {
  const currentUserIsAuthor = article?.file?.author.username === loggedInUser?.username
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
        await articleApi.unlike(article.slug)
      } else {
        await articleApi.like(article.slug)
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
