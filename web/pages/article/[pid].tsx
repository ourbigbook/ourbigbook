/** @jsxImportSource @emotion/react */
import { css, jsx } from '@emotion/react'
import styled from "@emotion/styled";
import React from "react";
import Head from "next/head";
import { GetStaticProps, GetStaticPaths } from 'next'

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
import sequelize from "lib/db";

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
    cirodown_runtime(elem);
  }
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    fallback: true,
    paths: (await sequelize.models.Article.findAll()).map(
      article => {
        return {
          params: {
            pid: article.slug,
          }
        }
      }
    ),
  }
}

export const getStaticProps: GetStaticProps = async ({ params: { pid } }) => {
  const article = await sequelize.models.Article.findOne({
    where: { slug: pid },
    include: [{ model: sequelize.models.User, as: 'Author' }],
  });
  const articleJson = article.toJSONFor(article.Author);
  return { props: { article: articleJson } };
}
