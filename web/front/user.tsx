import { defaultUserScoreTitle } from 'front/config'

export function displayAndUsernameText(user) {
  let ret = ''
  if (user?.displayName) {
    ret += `${user?.displayName} (`
  }
  ret += `@${user.username}`
  if (user?.displayName) {
    ret += ')'
  }
  return ret
}

export function DisplayAndUsername({ user, showUsername }) {
  let ret = ''
  if (showUsername === undefined) {
    showUsername = true
  }
  if (user.displayName) {
    ret += `${user.displayName} `
  } else {
    ret += `${user.username} `
  }
  const showParenthesis = user.displayName && showUsername
  if (showParenthesis) {
    ret += `(`
  }
  if (showUsername) {
    ret += `@${user.username}`
  }
  if (showParenthesis) {
    if (user.displayName) {
      ret += ', '
    } else {
      ret += ' ('
    }
  }
  return <>
    {ret}
    <span title={defaultUserScoreTitle}>{user.articleScoreSum}<i className="ion-heart"></i></span>{showParenthesis ? ')' : ''}
  </>
}
