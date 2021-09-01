import React from "react";
import Router from "next/router";

import ArticleAPI from "lib/api/article";
import { BUTTON_ACTIVE_CLASS } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

export const FavoriteArticleButtonContext = React.createContext(undefined);

const FavoriteArticleButton = ({
  article,
  showText,
}) => {
  const loggedInUser = getLoggedInUser()
  const currentUserIsAuthor = article?.author.username === loggedInUser?.username
  const { favorited, setFavorited, score, setScore } = React.useContext(FavoriteArticleButtonContext);
  let buttonText;
  let buttonTextMaybe;
  if (favorited) {
    buttonTextMaybe = 'Unfavorite'
  } else {
    buttonTextMaybe = 'Favorite'
  }
  if (showText) {
    buttonText = ' ' + buttonTextMaybe + ' Article '
  } else {
    buttonText = ''
  }
  const handleClickFavorite = async (e) => {
    e.preventDefault();
    if (currentUserIsAuthor) return
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    setFavorited(!favorited)
    setScore(score + (favorited ? - 1 : 1))
    try {
      if (favorited) {
        await ArticleAPI.unfavorite(article.slug, loggedInUser?.token)
      } else {
        await ArticleAPI.favorite(article.slug, loggedInUser?.token)
      }
    } catch (error) {
      setFavorited(!favorited)
      setScore(score + (favorited ? 1 : -1))
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
    title = 'You cannot favorite your own articles'
  } else {
    buttonClassName = favorited ? BUTTON_ACTIVE_CLASS : ''
    title = buttonTextMaybe + ' this article'
  }
  return (
    <button
      className={buttonClassName}
      onClick={handleClickFavorite}
      title={title}
    >
      <i className="ion-heart" />{showText ? ' ' : ''}{buttonText}
      {' '}{count}
    </button>
  )
}

export default FavoriteArticleButton;
