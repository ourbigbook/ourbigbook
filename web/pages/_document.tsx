import Document, { Html, Head, Main, NextScript } from 'next/document'
import React from 'react'
import { googleAnalyticsId, isProduction } from 'front/config'

interface IProps {
  css: any;
}

class MyDocument extends Document<IProps> {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);
    const { html, head } = await ctx.renderPage();
    return { ...initialProps, html, head };
  }

  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="shortcut icon" href="/favicon.svg" />
          {isProduction &&
            <>
              <script async src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}></script>
              <script
                dangerouslySetInnerHTML={{
                  __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${googleAnalyticsId}', { page_path: window.location.pathname });
`,
                }}
              />
            </>
          }
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
