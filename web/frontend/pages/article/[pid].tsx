import cirodown from 'cirodown';
import { cirodown_runtime } from 'cirodown/cirodown.runtime.js';
import React from "react";
import Head from "next/head";

import ArticleMeta from "components/article/ArticleMeta";
import CommentList from "components/comment/CommentList";
import LoadingSpinner from "components/common/LoadingSpinner";
import ArticleAPI from "lib/api/article";
import { ArticleType } from "lib/types/articleType";

export default class ArticlePage extends React.Component {
  article: ArticleType;
  pid: string;

  constructor(props) {
    super(props);
    this.renderRefCallback = this.renderRefCallback.bind(this);
  }

  render() {
    if (!this.props.article) return <LoadingSpinner />;
    const markup = {
      __html: cirodown.convert('= ' + this.props.article.title + '\n\n' + this.props.article.body, {body_only: true}),
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

  renderRefCallback() {
    cirodown_runtime(this.cirodownElem);
  }
}

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
