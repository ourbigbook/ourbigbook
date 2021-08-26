import Document, { Html, Head, Main, NextScript } from "next/document";
import React from "react";

interface IProps {
  css: any;
}

class MyDocument extends Document<IProps> {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    const { html, head } = ctx.renderPage();
    return { ...initialProps, html, head };
  }

  render() {
    const { ids }: any = this.props;
    return (
      <Html lang="en">
        <Head>
          <script async src="https://www.googletagmanager.com/gtag/js?id=UA-47867706-4"></script>
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'UA-47867706-4');
`,
            }}
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
