import { useRouter } from "next/router";
import React from "react";

import CustomLink from "components/CustomLink";
import Maybe from "components/Maybe";
import getLoggedInUser from "lib/utils/getLoggedInUser";
import routes from "routes";

const TabList = ({tab, setTab, tag}) => {
  const loggedInUser = getLoggedInUser()
  return (
    <div className="tab-list">
      <Maybe test={loggedInUser}>
        <CustomLink
          className={`tab-item${tab === 'followed-latest' ? ' active' : ''}`}
          href={routes.home()}
          onClick={() => {setTab('followed-latest')}}
          shallow
        >
          Latest Followed
        </CustomLink>
        <CustomLink
          className={`tab-item${tab === 'followed-top' ? ' active' : ''}`}
          href={routes.home()}
          onClick={() => {setTab('followed-top')}}
          shallow
        >
          Top Followed
        </CustomLink>
      </Maybe>
      <CustomLink
        className={`tab-item${tab === 'global-latest' ? ' active' : ''}`}
        href={routes.home()}
        shallow
        onClick={() => {
          setTab('global-latest')
        }}
      >
        Latest
      </CustomLink>
      <CustomLink
        className={`tab-item${tab === 'global-top' ? ' active' : ''}`}
        href={routes.home()}
        shallow
        onClick={() => {
          setTab('global-top')
        }}
      >
        Top
      </CustomLink>
    </div>
  );
};

export default TabList;
