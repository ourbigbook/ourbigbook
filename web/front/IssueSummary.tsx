import React from 'react'

import Maybe from 'front/Maybe'
import { webApi } from 'front/api'
import { formatDate } from 'front/date'
import UserLinkWithImage from 'front/UserLinkWithImage'

const IssueSummary = ({ issue, loggedInUser }) => {
  return (
    <div className="issue-summary">
      <div className="header">
        <UserLinkWithImage user={issue.author} showUsernameMobile={false} />
        {' '}
        {formatDate(issue.createdAt)}
        {' '}
      </div>
      <div className="title">
        {issue.titleRender}
      </div>
    </div>
  );
};

export default IssueSummary;
