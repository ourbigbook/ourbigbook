import React from 'react'

import { defaultUserScoreTitle } from 'front/config'
import { UserType } from 'front/types/UserType'

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

export type DisplayAndUsernameProps = {
  user: UserType,
  showUsername?: boolean,
  showUsernameMobile?: boolean,
}

export function DisplayAndUsername(
  {
    user,
    showUsername,
    showUsernameMobile,
  }
  : DisplayAndUsernameProps
) {
  let mobileMandatoryPart = ''
  let mobileOptionalPart: React.ReactNode  = ''
  if (showUsername === undefined) {
    showUsername = true
  }
  if (showUsernameMobile === undefined) {
    showUsernameMobile = true
  }
  if (user.displayName) {
    mobileMandatoryPart += `${user.displayName} `
  } else {
    mobileOptionalPart += `${user.username} `
  }
  const showParenthesis = user.displayName && showUsername
  if (showParenthesis) {
    mobileOptionalPart += `(`
  }
  if (showUsername) {
    mobileOptionalPart += `@${user.username}`
    // TODO https://stackoverflow.com/questions/33710833/how-do-i-conditionally-wrap-a-react-component
    //if (showUsernameMobile) {
    //  ret += `@${user.username}`
    //} else {
    //  ret += <span className="mobile-hide">`@${user.username}`</span>
    //}
  }
  if (showParenthesis) {
    if (user.displayName) {
      mobileOptionalPart += ', '
    } else {
      mobileOptionalPart += ' ('
    }
  }
  let mobileOptionalPartPost: React.ReactNode = showParenthesis ? ')' : ''
  if (!showUsernameMobile) {
    mobileOptionalPart = <span className="mobile-hide">{mobileOptionalPart}</span>
    mobileOptionalPartPost = <span className="mobile-hide">{mobileOptionalPartPost}</span>
  }
  return <>
    {mobileMandatoryPart}
    {mobileOptionalPart}
    <span title={defaultUserScoreTitle}>{user.score}<i className="ion-heart"></i></span>
    {mobileOptionalPartPost}
  </>
}
