import styled from "@emotion/styled";
import cirodown from 'cirodown';
import 'cirodown/cirodown.runtime.js';
import React from "react";
import Head from "next/head";

import ArticleMeta from "components/article/ArticleMeta";
import CommentList from "components/comment/CommentList";
import LoadingSpinner from "components/common/LoadingSpinner";
import ArticleAPI from "lib/api/article";
import { ArticleType } from "lib/types/articleType";

interface ArticlePageProps {
  article: ArticleType;
  pid: string;
}

const ArticlePage = ({ article, pid }: ArticlePageProps) => {
  if (!article) return <LoadingSpinner />;
  const markup = {
    __html: cirodown.convert('= ' + article.title + '\n\n' + article.body, {body_only: true}),
  };
  return (
    <>
      <Head>
        <title>{article.title}</title>
      </Head>
      <div>
        <ArticleMeta article={article} />
        <div>
          <div
            className="cirodown"
            dangerouslySetInnerHTML={markup}
          />
        </div>
      </div>
    </>
  );
};

export async function getStaticPaths() {
  return { paths: [], fallback: true };
}

export async function getStaticProps({ params }) {
  const { pid } = params;
  try {
    const { data } = await ArticleAPI.get(pid);
    return {
      props: {
        article: data?.article,
        pid,
      },
      revalidate: 1,
    };
  } catch (error) {
    console.error(`Get Article id ${pid} error: `, error);
    return {
      props: {
        article: {},
        pid,
      },
      revalidate: 1,
    };
  }
}

export default ArticlePage;
