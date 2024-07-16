import React from 'react'

import { defaultUserScoreTitle } from 'front/config'
import { UserType } from 'front/types/UserType'
import CustomLink from 'front/CustomLink'
import { LikeIcon } from 'front'
import routes from 'front/routes'

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

export function UserLink({ children, user }) {
  return <CustomLink
    href={routes.user(user.username)}
    className="author username"
  >
    {children}
  </CustomLink>
}

export function UserScore({ space=false, user }) {
  return <span title={defaultUserScoreTitle}>{user.score}{space ? ' ' : ''}<LikeIcon /></span>
}

export type DisplayAndUsernameProps = {
  user: UserType,
  showScore?: boolean,
  showUsername?: boolean,
  showUsernameMobile?: boolean,
}

export function DisplayAndUsername(
  {
    user,
    showScore=true,
    showUsername=true,
    showUsernameMobile=true,
  }
  : DisplayAndUsernameProps
) {
  let mobileMandatoryPart: React.ReactNode[] = []
  let mobileOptionalPart: React.ReactNode[] = []
  if (user.displayName) {
    mobileMandatoryPart.push(<span className="display-name">{user.displayName} </span>)
  } else {
    mobileOptionalPart.push(`${user.username} `)
  }
  const showParenthesis = user.displayName && showUsername
  if (showParenthesis) {
    mobileOptionalPart.push(<span className="par">(</span>)
  }
  if (showUsername) {
    mobileOptionalPart.push(`@${user.username}`)
    // TODO https://stackoverflow.com/questions/33710833/how-do-i-conditionally-wrap-a-react-component
    //if (showUsernameMobile) {
    //  ret += `@${user.username}`
    //} else {
    //  ret += <span className="mobile-hide">`@${user.username}`</span>
    //}
  }
  if (showParenthesis) {
    if (user.displayName) {
      mobileOptionalPart.push(', ')
    } else {
      mobileOptionalPart.push(' (')
    }
  }
  let mobileOptionalPartPost: React.ReactNode = showParenthesis ? <span className="par">)</span> : ''
  if (!showUsernameMobile) {
    mobileOptionalPart.push(<span className="mobile-hide">{mobileOptionalPart}</span>)
    mobileOptionalPartPost = <span className="mobile-hide">{mobileOptionalPartPost}</span>
  }
  return <>
    {mobileMandatoryPart}
    <span className="username-and-score">
      {mobileOptionalPart}
      {showScore && <UserScore user={user} />}
      {mobileOptionalPartPost}
    </span>
  </>
}
