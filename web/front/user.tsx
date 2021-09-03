import { DEFAULT_USER_SCORE_TITLE } from "lib/utils/constant"

export function DisplayAndUserName({ user }) {
  let ret = ''
  if (user.displayName) {
    ret += `${user.displayName} (`
  }
  ret += user.username
  if (user.displayName) {
    ret += ', '
  } else {
    ret += ' ('
  }
  return (
    <>
      {ret}
      <span title={DEFAULT_USER_SCORE_TITLE}>{user.articleScoreSum}<i className="ion-heart"></i></span>)
    </>
  )
}
