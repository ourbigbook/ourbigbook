import { useRouter } from 'next/router'
import React from 'react'

import CustomLink from 'front/CustomLink'
import LikeArticleButton from 'front/LikeArticleButton'
import LoadingSpinner from 'front/LoadingSpinner'
import Pagination, { PaginationPropsUrlFunc } from 'front/Pagination'
import UserLinkWithImage from 'front/UserLinkWithImage'
import { AppContext } from 'front'
import { articleLimit } from 'front/config'
import { formatDate } from 'front/date'
import routes from 'front/routes'
import { ArticleType } from 'front/types/ArticleType'
import { UserType } from 'front/types/UserType'

export type UserListProps = {
  users: UserType[];
  userCount: number;
  loggedInUser?: UserType,
  page: number;
  paginationUrlFunc: PaginationPropsUrlFunc;
  showAuthor: boolean;
  what: string;
}

const UserList = ({
  loggedInUser,
  page,
  paginationUrlFunc,
  users,
  usersCount,
  what
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
      <div className="list-container">
        <table className="list">
          <thead>
            <tr>
              <th className="shrink">User</th>
              <th className="shrink">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id}>
                <td className="shrink">
                  <UserLinkWithImage user={user} />
                </td>
                <td className="shrink">{formatDate(user.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginationUrlFunc &&
        <Pagination {...{
          currentPage: page,
          itemsCount: usersCount,
          itemsPerPage: articleLimit,
          urlFunc: paginationUrlFunc,
          what: 'users',
        }} />
      }
    </div>
  );
};

export default UserList;
