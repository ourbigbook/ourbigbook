import Head from "next/head";
import React from "react";

import ArticleList from "components/ArticleList";
import Maybe from "components/Maybe";
import TabList from "components/TabList";
import { APP_NAME } from "lib/utils/constant";
import getLoggedInUser from "lib/utils/getLoggedInUser";

const IndexPage = () => {
  const loggedInUser = getLoggedInUser()
  const [tab, setTab] = React.useState(loggedInUser ? 'followed-latest' : 'global-latest')
  const [tag, setTag] = React.useState()
  React.useEffect(() => {
    setTab(loggedInUser ? 'followed-latest' : 'global-latest')
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
