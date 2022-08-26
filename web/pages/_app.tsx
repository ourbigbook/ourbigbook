import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';
import useSWR from 'swr'
import useLoggedInUser from 'front/useLoggedInUser'

import { aboutUrl, appName, contactUrl, donateUrl, googleAnalyticsId, isProduction } from 'front/config';
import Navbar from 'front/Navbar'
import { AppContext, AppContextProvider, HelpIcon } from 'front'
import { webApi } from 'front/api'

// Css
// migrating the local ourbigbook to webpack: https://github.com/ourbigbook/ourbigbook/issues/157
import 'ourbigbook/dist/ourbigbook.css'
import 'ourbigbook/editor.scss'
import 'ionicons/css/ionicons.min.css'
import 'style.scss'

//// https://nextjs.org/docs/advanced-features/measuring-performance
//export function reportWebVitals(metric) {
//  console.log(metric)
//}

function MyHead() {
  const { title } = React.useContext(AppContext)
  let realTitle = title ? title + ' - ' : ''
  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <title>{realTitle + appName}</title>
    </Head>
  )
}

function handleRouteChange(url) {
  window.gtag('config', googleAnalyticsId, {
    page_path: url,
  })
}

const MyApp = ({ Component, pageProps }) => {
  if (isProduction) {
    // Google Analytics page switches:
    // https://stackoverflow.com/questions/60411351/how-to-use-google-analytics-with-next-js-app/62552263#62552263
    const router = useRouter();
    useEffect(() => {
      router.events.on('routeChangeComplete', handleRouteChange);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange);
      };
    }, [router.events]);
  }

  // Fetch every post-load user-specific data required for a page at once here.
  // We can get things up from inner components with properties much like `Component.isEditor`.
  // And ideally one day we will do it all in a single GraphQL query!
  const loggedInUser = useLoggedInUser()
  const { data, error } = useSWR(loggedInUser ? '/api/min' : null, async () => {
    return webApi.min()
  })
  let scoreDelta
  if (!data || error) {
    scoreDelta = 0
  } else {
    scoreDelta = data.data.scoreDelta
  }

  const isEditor = !!Component.isEditor
  return (
    <AppContextProvider>
      <MyHead />
      <div className={`toplevel${isEditor ? ' editor' : ''}`}>
        <Navbar {...{ isEditor, scoreDelta }} />
        <div className="main">
          <Component {...pageProps} />
        </div>
        {!isEditor &&
          <footer>
            <a href={aboutUrl}><HelpIcon /> About</a>
            <a href={donateUrl}>$ Donate</a>
            <a href="https://cirosantilli.com/ourbigbook-com/content-license"><i className="ion-document-text" /> Content license: CC BY-SA 4.0 unless noted</a>
            <a href="https://github.com/ourbigbook/ourbigbook/tree/master/web"><i className="ion-social-github" /> Website source code</a>
            <a href={contactUrl}><i className="ion-ios-chatbubble" /> Contact, bugs, suggestions, abuse reports</a>
            <a href="https://twitter.com/OurBigBook"><i className="ion-social-twitter" /> @OurBigBook</a>
            <a href="https://www.youtube.com/@OurBigBook"><i className="ion-social-youtube" /> @OurBigBook</a>
          </footer>
        }
      </div>
    </AppContextProvider>
  )
}

export default MyApp;
