import Head from "next/head";
import React from "react";

import ArticleList from "components/article/ArticleList";
import Maybe from "components/common/Maybe";
import Tags from "components/home/Tags";
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
        <meta
          name="description"
          content="Next.js + SWR codebase containing realworld examples (CRUD, auth, advanced patterns, etc) that adheres to the realworld spec and API"
        />
      </Head>
      <div className="home-page">
        <Maybe test={!loggedInUser}>
          <div className="banner">
            <div className="container">
              <h1 className="logo-font">{APP_NAME.toLowerCase()}</h1>
              <p>A place to share your knowledge.</p>
            </div>
          </div>
        </Maybe>
        <div className="container page">
          <div className="row">
            <div className="col-md-9">
              <div className="feed-toggle">
                <TabList tab={tab} setTab={setTab} tag={tag} />
              </div>
              <ArticleList what={tab} tag={tag}/>
            </div>
            <div className="col-md-3">
              <div className="sidebar">
                <p>Popular Tags</p>
                <Tags setTab={setTab} setTag={setTag} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default IndexPage;
