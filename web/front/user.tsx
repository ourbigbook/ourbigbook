import { defaultUserScoreTitle } from 'front/config'

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
    <span title={defaultUserScoreTitle}>{user.articleScoreSum}<i className="ion-heart"></i></span>)
  </>
}
