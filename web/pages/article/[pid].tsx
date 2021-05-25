/** @jsxImportSource @emotion/react */
import { css, jsx } from '@emotion/react'
import styled from "@emotion/styled";
import React from "react";
import Head from "next/head";

import cirodown from 'cirodown';
import { cirodown_runtime } from 'cirodown/cirodown.runtime.js';

import CommentList from "components/comment/CommentList";
import LoadingSpinner from "components/common/LoadingSpinner";
import ArticleAPI from "lib/api/article";
import ArticleActions from "components/article/ArticleActions";
import { ArticleType } from "lib/types/articleType";
import CustomImage from "components/common/CustomImage";
import CustomLink from "components/common/CustomLink";
import { formatDate } from "lib/utils";
import { getStaticPathsArticle, getStaticPropsArticle } from "lib/article";

function ArticleMeta({ article }) {
  if (!article) return;
  return (
    <>
      <div css={css`
        display: block;
        position: relative;
        font-weight: 300;
        margin: 2rem 0 0;
      `}>
        <CustomLink
          href="/profile/[pid]"
          as={`/profile/${encodeURIComponent(article.author?.username)}`}
        >
          <CustomImage
            src={article.author?.image}
            alt="author-profile-image"
            css={css`
              display: inline-block;
              vertical-align: middle;
              height: 32px;
              width: 32px;
              border-radius: 30px;
            `}
          />
          &nbsp;
          {article.author?.username}
        </CustomLink>
        <div>Created: {formatDate(article.createdAt)} Updated: {formatDate(article.createdAt)}</div>
      </div>
      <ArticleActions article={article} />
    </>
  );
};

type Props = {
  article: ArticleType,
  pid: string;
}

export default class ArticlePage extends React.Component<Props, {}> {
  constructor(props) {
    super(props);
  }

  render() {
    if (!this.props.article) return <LoadingSpinner />;
    const markup = {
      __html: this.props.article.render,
    };
    return (
      <>
        <Head>
          <title>{this.props.article.title}</title>
        </Head>
        <div>
          <ArticleMeta article={this.props.article} />
          <div>
            <div
              className="cirodown"
              dangerouslySetInnerHTML={markup}
              ref={this.renderRefCallback}
            />
          </div>
        </div>
      </>
    );
  }

  renderRefCallback(elem) {
    if (elem) {
      cirodown_runtime(elem);
    }
  }
}

export const getStaticPaths = getStaticPathsArticle;
export const getStaticProps = getStaticPropsArticle;
