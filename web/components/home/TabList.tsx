import { useRouter } from "next/router";
import React from "react";

import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const TabList = ({tab, setTab, tag}) => {
  const loggedInUser = getLoggedInUser()
  return (
    <div className="tab-list">
      <Maybe test={loggedInUser}>
        <CustomLink
          className={`tab-item${tab === 'feed' ? ' active' : ''}`}
          href={routes.home()}
          onClick={() => {setTab('feed')}}
          shallow
        >
          Your Feed
        </CustomLink>
      </Maybe>
      <CustomLink
        className={`tab-item${tab === 'global' ? ' active' : ''}`}
        href={routes.home()}
        shallow
        onClick={() => {
          setTab('global')
        }}
      >
        All Articles
      </CustomLink>
      <Maybe test={tab == 'tag'}>
        <CustomLink
          href={routes.home()}
          className="tab-item active"
          shallow
        >
          <i className="ion-pound" /> {tag}
        </CustomLink>
      </Maybe>
    </div>
  );
};

export default TabList;
