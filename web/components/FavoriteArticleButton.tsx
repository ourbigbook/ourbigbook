import React from "react";
import Router from "next/router";

import ArticleAPI from "lib/api/article";
import { BUTTON_ACTIVE_CLASS } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

export const FavoriteArticleButtonContext = React.createContext(undefined);

const FavoriteArticleButton = ({
  showText,
  slug,
}) => {
  const loggedInUser = getLoggedInUser()
  const { favorited, setFavorited, score, setScore } = React.useContext(FavoriteArticleButtonContext);
  let buttonText;
  if (showText) {
    if (favorited) {
      buttonText = 'Unfavorite'
    } else {
      buttonText = 'Favorite'
    }
    buttonText = ' ' + buttonText + ' Article '
  } else {
    buttonText = ''
  }
  const handleClickFavorite = async (e) => {
    e.preventDefault();
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    setFavorited(!favorited)
    setScore(score + (favorited ? - 1 : 1))
    try {
      if (favorited) {
        await ArticleAPI.unfavorite(slug, loggedInUser?.token)
      } else {
        await ArticleAPI.favorite(slug, loggedInUser?.token)
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
  return (
    <button
      className={favorited ? BUTTON_ACTIVE_CLASS : ''}
      onClick={handleClickFavorite}
    >
      <i className="ion-heart" />{showText ? ' ' : ''}{buttonText}
      {' '}{count}
    </button>
  )
}

export default FavoriteArticleButton;
