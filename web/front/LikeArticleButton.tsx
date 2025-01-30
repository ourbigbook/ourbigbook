import React from 'react'
import Router from 'next/router'

import { webApi } from 'front/api'
import { cant } from 'front/cant'
import { buttonActiveClass } from 'front/config'
import routes from 'front/routes'
import { LikeIcon } from 'front'

const LikeArticleButton = ({
  article,
  isIssue,
  issueArticle=undefined,
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
    buttonText = <>{' '}{buttonTextMaybe}</>
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
    setScore((score) => score + (liked ? - 1 : 1))
    setLiked((liked) => !liked)
    let ret
    if (liked) {
      if (isIssue) {
        ret = await webApi.issueUnlike(issueArticle.slug, article.number)
      } else {
        ret = await webApi.articleUnlike(article.slug)
      }
    } else {
      if (isIssue) {
        ret = await webApi.issueLike(issueArticle.slug, article.number)
      } else {
        ret = await webApi.articleLike(article.slug)
      }
    }
    const { data, status } = ret
    if (status !== 200) {
      alert(`error: ${status} ${JSON.stringify(data)}`)
      setLiked((liked) => !liked)
      setScore((score) => score + (liked ? 1 : -1))
    }
  };
  let count = score;
  if (showText) {
    count = <span className="counter">{count}</span>
  }
  let buttonClassNames = ['modal']
  let title;
  if (loggedInUser && cantLike) {
    buttonClassNames.push('disabled')
    title = cantLike
  } else {
    if (liked) {
      buttonClassNames.push(buttonActiveClass)
    }
    title = buttonTextMaybe + ` this ${isIssue ? 'discussion' : 'article' }`
  }
  return (
    <button
      className={buttonClassNames.join(' ')}
      onClick={handleClickLike}
      title={title}
    >
      <LikeIcon />
      {' '}{count}
      {showText ? ' ' : ''}{buttonText}
    </button>
  )
}

export default LikeArticleButton;
