import React from "react";
import Router from "next/router";

import ArticleAPI from "lib/api/article";
import { BUTTON_ACTIVE_CLASS } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

export const FavoriteArticleButtonContext = React.createContext(undefined);

const FavoriteArticleButton = (props) => {
  const loggedInUser = getLoggedInUser()
  const {favorited, setFavorited, favoritesCount, setFavoritesCount} = React.useContext(FavoriteArticleButtonContext);
  let buttonText;
  if (props.showText) {
    if (favorited) {
      buttonText = 'Unfavorite'
    } else {
      buttonText = 'Favorite'
    }
    buttonText = ' ' + buttonText + ' Article '
  } else {
    buttonText = ''
  }
  const handleClickFavorite = async () => {
    if (!loggedInUser) {
      Router.push(routes.userLogin());
      return;
    }
    setFavorited(!favorited)
    setFavoritesCount(favoritesCount + (favorited ? - 1 : 1))
    try {
      if (favorited) {
        await ArticleAPI.unfavorite(props.slug, loggedInUser?.token)
      } else {
        await ArticleAPI.favorite(props.slug, loggedInUser?.token)
      }
    } catch (error) {
      setFavorited(!favorited)
      setFavoritesCount(favoritesCount + (favorited ? 1 : -1))
    }
  };
  let count = favoritesCount;
  if (props.showText) {
    count = (<span className="counter">({count})</span>)
  }
  return (
    <button
      className={favorited ? BUTTON_ACTIVE_CLASS : ''}
      onClick={() => handleClickFavorite()}
    >
      <i className="ion-heart" />{props.showText ? ' ' : ''}{buttonText}
      {' '}{count}
    </button>
  )
}

export default FavoriteArticleButton;
