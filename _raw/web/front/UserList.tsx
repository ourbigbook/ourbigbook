import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { UserLink, UserScore } from 'front/user'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { UserType } from 'front/types/UserType'

export type UserListProps = {
  loggedInUser?: UserType;
  page: number;
  paginationUrlFunc?: PaginationPropsUrlFunc;
  users: UserType[];
  usersCount: number;
}

const UserList = ({
  loggedInUser,
  page,
  paginationUrlFunc,
  users,
  usersCount,
}: UserListProps) => {
  const router = useRouter();
  const { asPath, pathname, query } = router;
  const { like, follow, tag, uid } = query;
  if (users.length === 0) {
    return <div className="article-preview">
      There are no users on the website.
    </div>;
  }
  return (
    <div className="list-nav-container">
      <div className="list-container content-not-ourbigbook">
        <table className="list">
          <thead>
            <tr>
              <th className="shrink">Score</th>
              <th className="shrink">User</th>
              <th className="shrink">Username</th>
              <th className="shrink">Followers</th>
              <th className="shrink">Joined</th>
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
      }} />
    </div>
  );
};

export default UserList;
