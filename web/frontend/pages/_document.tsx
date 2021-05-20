import { extractCritical } from "emotion-server";
import Document, { Head, Main, NextScript } from "next/document";
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
      <html lang="en">
        <Head>
          <link
            rel="stylesheet"
            href="//code.ionicframework.com/ionicons/2.0.1/css/ionicons.min.css"
          />
          <link
            rel="stylesheet"
            href="//fonts.googleapis.com/css?family=Titillium+Web:700|Source+Serif+Pro:400,700|Merriweather+Sans:400,700|Source+Sans+Pro:400,300,600,700,300italic,400italic,600italic,700italic&display=swap"
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
      </html>
    );
  }
}

export default MyDocument;
