import axios from "axios";
import React from "react";
import Router from "next/router";

import { SERVER_BASE_URL } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const FAVORITED_CLASS = "btn btn-sm btn-primary";
const NOT_FAVORITED_CLASS = "btn btn-sm btn-outline-primary";

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
      Router.push(`/user/login`);
      return;
    }
    setFavorited(!favorited)
    setFavoritesCount(favoritesCount + (favorited ? - 1 : 1))
    try {
      if (favorited) {
        await axios.delete(`${SERVER_BASE_URL}/articles/${props.slug}/favorite`, {
          headers: {
            Authorization: `Token ${loggedInUser?.token}`,
          },
        });
      } else {
        await axios.post(
          `${SERVER_BASE_URL}/articles/${props.slug}/favorite`,
          {},
          {
            headers: {
              Authorization: `Token ${loggedInUser?.token}`,
            },
          }
        );
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
      className={
        favorited ? FAVORITED_CLASS : NOT_FAVORITED_CLASS
      }
      onClick={() => handleClickFavorite()}
    >
      <i className="ion-heart" />{props.showText ? ' ' : ''}{buttonText}
      {' '}{count}
    </button>
  )
}

export default FavoriteArticleButton;
