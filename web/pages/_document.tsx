import { extractCritical } from "emotion-server";
import Document, { Html, Head, Main, NextScript } from "next/document";
import React from "react";
import flush from "styled-jsx/server";

interface IProps {
  css: any;
}

class MyDocument extends Document<IProps> {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    const { html, head } = ctx.renderPage();
    const styles = flush();
    const emotionStyles = extractCritical(html);
    return { ...emotionStyles, ...initialProps, html, head, styles };
  }

  render() {
    const { ids }: any = this.props;
    return (
      <Html lang="en">
        <Head>
          <link
            rel="stylesheet"
            href="//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css"
          />
          <style
            data-emotion-css={ids.join(" ")}
            dangerouslySetInnerHTML={{ __html: this.props.css }}
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
