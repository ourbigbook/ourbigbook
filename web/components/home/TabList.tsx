import { useRouter } from "next/router";
import React from "react";

import CustomLink from "components/common/CustomLink";
import Maybe from "components/common/Maybe";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const TabList = ({tab, setTab, tag}) => {
  const loggedInUser = getLoggedInUser()
  return (
    <div className="tab-list">
      <Maybe test={loggedInUser}>
        <CustomLink
          className={`tab-item${tab === 'feed' ? ' active' : ''}`}
          href="/"
          onClick={() => {setTab('feed')}}
          shallow
        >
          Your Feed
        </CustomLink>
      </Maybe>
      <CustomLink
        className={`tab-item${tab === 'global' ? ' active' : ''}`}
        href="/"
        shallow
        onClick={() => {
          setTab('global')
        }}
      >
        Global Feed
      </CustomLink>
      <Maybe test={tab == 'tag'}>
        <CustomLink
          href={`/`}
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
