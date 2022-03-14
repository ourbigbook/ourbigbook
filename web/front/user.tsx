import { DEFAULT_USER_SCORE_TITLE } from 'constant'

export function displayAndUsernameText(user) {
  let ret = ''
  if (user?.displayName) {
    ret += `${user?.displayName} (`
  }
  ret += user.username
  if (user?.displayName) {
    ret += ')'
  }
  return ret
}

export function DisplayAndUsername({ user }) {
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
  return <>
    {ret}
    <span title={DEFAULT_USER_SCORE_TITLE}>{user.articleScoreSum}<i className="ion-heart"></i></span>)
  </>
}
