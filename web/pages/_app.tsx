import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr'
import useLoggedInUser from 'front/useLoggedInUser'

import { aboutUrl, appName, contactUrl, docsUrl, donateUrl, googleAnalyticsId, isProduction } from 'front/config';
import Navbar from 'front/Navbar'
import { AppContext, AppContextProvider, HelpIcon, logout } from 'front'
import { webApi } from 'front/api'
import routes from 'front/routes'

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

function handleRouteChange(url) {
  window.gtag('config', googleAnalyticsId, {
    page_path: url,
  })
}

const MyApp = ({ Component, pageProps }) => {
  const router = useRouter()
  const [prevPageNoSignup, setPrevPageNoSignup] = useState({ prev: null, cur: null });
  function updatePrevPageNoSignup(newCur) {
    // This is so that for logged off user the sequence:
    // - Create new article button
    if (newCur !== routes.userNew()) {
      const newVal = {
        prev: prevPageNoSignup.cur,
        cur: newCur,
      }
      setPrevPageNoSignup(newVal)
    }
  }
  useEffect(() => {
      updatePrevPageNoSignup(router?.asPath)
    },
    [router?.asPath, setPrevPageNoSignup]
  )
  // Google Analytics page switches:
  // https://stackoverflow.com/questions/60411351/how-to-use-google-analytics-with-next-js-app/62552263#62552263
  useEffect(() => {
    if (isProduction) {
      router.events.on('routeChangeComplete', handleRouteChange)
      return () => {
        router.events.off('routeChangeComplete', handleRouteChange)
      }
    }
  }, [router.events])

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
  useEffect(() => {
    if (error || (data && !data.data.loggedIn)) {
      logout()
    }
  }, [data, error])

  const isEditor = !!Component.isEditor
  return (
    <AppContextProvider vals={{ prevPageNoSignup: prevPageNoSignup.prev, updatePrevPageNoSignup }} >
      <div className={`toplevel${isEditor ? ' editor' : ''}`}>
        <Navbar {...{ isEditor, scoreDelta }} />
        <div className="main">
          <Component {...pageProps} />
        </div>
        {!isEditor &&
          <footer>
            <a href={aboutUrl}><HelpIcon /> About</a>
            <a href={donateUrl}>$ Donate</a>
            <a href={`${docsUrl}#ourbigbook-com-content-license`}><i className="ion-document-text" /> Content license: CC BY-SA 4.0 unless noted</a>
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
