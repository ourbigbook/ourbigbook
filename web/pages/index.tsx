import Head from "next/head";
import React from "react";

import ArticleList from "components/article/ArticleList";
import Maybe from "components/common/Maybe";
import TabList from "components/home/TabList";
import { APP_NAME } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const IndexPage = () => {
  const loggedInUser = getLoggedInUser()
  const [tab, setTab] = React.useState(loggedInUser ? 'feed' : 'global')
  const [tag, setTag] = React.useState()
  React.useEffect(() => {
    setTab(loggedInUser ? 'feed' : 'global')
  }, [loggedInUser])
  return (
    <>
      <Head>
        <title>{APP_NAME}</title>
      </Head>
      <div className="home-page content-not-cirodown">
        <div className="feed-toggle">
          <TabList tab={tab} setTab={setTab} tag={tag} />
        </div>
        <ArticleList what={tab} tag={tag}/>
      </div>
    </>
  )
}

export default IndexPage;
