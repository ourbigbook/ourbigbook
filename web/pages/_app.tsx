import ContextProvider from "lib/context"
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { googleAnalyticsId, isProduction } from "config";
import Footer from "components/Footer"
import Navbar from "components/Navbar"

// Css
// migrating the local cirodown to webpack: https://github.com/cirosantilli/cirodown/issues/157
import 'cirodown/dist/cirodown.css'
import 'cirodown/editor.scss'
import 'ionicons/css/ionicons.min.css'
import 'style.scss'

const MyApp = ({ Component, pageProps }) => {
  if (isProduction) {
    // Google Analytics page switches:
    // https://stackoverflow.com/questions/60411351/how-to-use-google-analytics-with-next-js-app/62552263#62552263
    const router = useRouter();
    const handleRouteChange = (url) => {
      window.gtag('config', googleAnalyticsId, {
        page_path: url,
      });
    };
    useEffect(() => {
      router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }, [router.events]);
  }

  const isEditor = !!Component.isEditor
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
      </Head>
      <ContextProvider>
        <div className={`toplevel${isEditor ? ' editor' : ''}`}>
          <Navbar />
          <div className="main">
            <Component {...pageProps} />
          </div>
          {!isEditor &&
            <Footer />
          }
        </div>
      </ContextProvider>
    </>
  )
}

export default MyApp;
