import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

import lodash from 'lodash'

import { formatDate } from 'ourbigbook'

import CustomLink from 'front/CustomLink'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { UserLink, UserScore } from 'front/user'
import { articleLimit } from 'front/config'
import { TRI_ALL, TRI_FALSE, TRI_TRUE } from 'front/js'
import routes from 'front/routes'
import { UserType } from 'front/types/UserType'
import { booleanToStringForTable, CommentIcon, DiscussionIcon, FollowIcon, LikeIcon, LockIcon, OkIcon, TimeIcon, UserIcon } from 'front'

export type UserListProps = {
  hasLocked?: boolean;
  hasUnverified?: boolean;
  locked?: boolean;
  loggedInUser?: UserType;
  page: number;
  paginationUrlFunc?: PaginationPropsUrlFunc;
  users: UserType[];
  usersCount: number;
  verified?: boolean;
}

const UserList = ({
  hasLocked,
  hasUnverified,
  locked,
  loggedInUser,
  page,
  paginationUrlFunc,
  users,
  usersCount,
  verified,
}: UserListProps) => {
  const router = useRouter()
  return (
    <div className="list-nav-container">
      {users.length === 0
        ? <div className="article-preview content-not-ourbigbook">
            There are no users on the website.
          </div>
        : <><div className="list-container content-not-ourbigbook">
        <table className="list">
          <thead>
            <tr>
              <th className="shrink"><LikeIcon /> Score</th>
              <th className="shrink"><UserIcon /> User</th>
              <th className="shrink"><UserIcon /> Username</th>
              <th className="shrink"><FollowIcon /> Followers</th>
              <th className="shrink"><TimeIcon /> Joined</th>
              <th className="shrink"><DiscussionIcon /> Discussions</th>
              <th className="shrink"><CommentIcon /> Comments</th>
              <th className="shrink"><OkIcon /> Email verified</th>
              <th className="shrink"><LockIcon /> Locked</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id}>
                <td className="shrink right"><UserScore space={true} user={user} /></td>
                <td className="shrink">
                  <UserLinkWithImage showUsername={false} showScore={false} user={user} />
                </td>
                <td className="shrink"><UserLink user={user}>@{user.username}</UserLink></td>
                <td className="shrink right bold"><CustomLink href={routes.userFollowed(user.username)}>{user.followerCount}</CustomLink></td>
                <td className="shrink">{formatDate(user.createdAt)}</td>
                <td className="shrink right bold"><CustomLink href={routes.userIssues(user.username)}>{user.discussionCount}</CustomLink></td>
                <td className="shrink right bold"><CustomLink href={routes.userComments(user.username)}>{user.commentCount}</CustomLink></td>
                <td className="shrink right">{booleanToStringForTable(user.verified)}</td>
                <td className="shrink right">{booleanToStringForTable(user.locked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...{
        currentPage: page,
        itemsCount: usersCount,
        itemsPerPage: articleLimit,
        urlFunc: paginationUrlFunc,
        what: 'users',
      }} /></>}
      {hasLocked === true &&
        <p className="content-not-ourbigbook">
          <LockIcon />{' '}
          {locked === false
            ? <>
                Only unlocked users are being shown,{' '}
                <Link href={{ pathname: router.pathname, query: { ...router.query, locked: TRI_ALL } }}>
                  also show locked users
                </Link>
                {' '}or{' '}
                <Link href={{ pathname: router.pathname, query: { ...router.query, locked: TRI_TRUE } }}>
                  only show locked users
                </Link>.
              </>
            : <>
                {locked === true ? 'Only locked users are being shown' : 'Locked users are being shown'},
                {' '}
                <Link href={{ pathname: router.pathname, query: lodash.omit(router.query, 'locked') }}>
                  click here to show only unlocked users
                </Link>.
              </>
          }
        </p>
      }
      {hasUnverified === true &&
        <p className="content-not-ourbigbook">
          <OkIcon />{' '}
          {verified === true
            ? <>
                Only users with verified email are being shown,{' '}
                <Link href={{ pathname: router.pathname, query: { ...router.query, verified: TRI_ALL } }}>
                  also show users with unverified email
                </Link>
                {' '}or{' '}
                <Link href={{ pathname: router.pathname, query: { ...router.query, verified: TRI_FALSE } }}>
                  only show users with unverified email
                </Link>.
              </>
            : <>
                {verified === false ? 'Only users with unverified email are being shown' : 'Users with unverified email are being shown'},
                {' '}
                <Link href={{ pathname: router.pathname, query: lodash.omit(router.query, 'verified') }}>
                  click here to show only users with verified email
                </Link>.
              </>
          }
        </p>
      }
    </div>
  );
};

export default UserList;
