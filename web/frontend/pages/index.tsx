import styled from "@emotion/styled";
import Head from "next/head";
import React from "react";

import { APP_NAME } from "../lib/utils/constant";
import ArticleList from "components/article/ArticleList";
import TabList from "components/home/TabList";

const IndexPageContainer = styled("div")``;

const IndexPagePresenter = styled("div")`
  margin: 1.5rem auto 0;
  padding: 0 15px;
`;

const MainContent = styled("div")`
`;

const ContentContainer = styled("div")`
`;

const FeedToggle = styled("div")`
  margin-bottom: -1px;
`;

const IndexPage = () => (
  <>
    <Head>
      <title>{APP_NAME}</title>
    </Head>
    <IndexPageContainer className="home-page">
      <IndexPagePresenter>
        <MainContent>
          <ContentContainer>
            <FeedToggle>
              <TabList />
            </FeedToggle>
            <ArticleList />
          </ContentContainer>
        </MainContent>
      </IndexPagePresenter>
    </IndexPageContainer>
  </>
);

export default IndexPage;
