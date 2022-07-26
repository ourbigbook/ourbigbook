import React from 'react'
import Router from 'next/router'

import { webApi } from 'front/api'
import { cant } from 'front/cant'
import { buttonActiveClass } from 'front/config'
import routes from 'front/routes'

const LikeArticleButton = ({
  article,
  isIssue,
  issueArticle,
  loggedInUser,
  showText,
}) => {
  const ret = {}
  const cantLike = cant.likeArticle(loggedInUser, article, ret)
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
    buttonText = <>{' '}<span className="disable-part">{buttonTextMaybe}</span></>
  } else {
    buttonText = ''
  }
  const handleClickLike = async (e) => {
    e.preventDefault();
    if (loggedInUser) {
      if (cantLike) return
    } else {
      Router.push(routes.userNew());
      return;
    }
    setLiked(!liked)
    setScore(score + (liked ? - 1 : 1))
    try {
      if (liked) {
        if (isIssue) {
          await webApi.issueUnlike(issueArticle.slug, article.number)
        } else {
          await webApi.articleUnlike(article.slug)
        }
      } else {
        if (isIssue) {
          await webApi.issueLike(issueArticle.slug, article.number)
        } else {
          await webApi.articleLike(article.slug)
        }
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
  if (loggedInUser && cantLike) {
    buttonClassName = 'disabled'
    title = cantLike
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
