import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import { useReportWebVitals } from 'next/web-vitals'

import {
  aboutUrl,
  contactUrl,
  docsUrl,
  donateUrl,
  googleAnalyticsId,
  log,
  isProduction
} from 'front/config';
import Navbar from 'front/Navbar'
import {
  AppContextProvider,
  FontAwesomeIcon,
  HelpIcon,
  DiscussionIcon,
} from 'front'
import routes from 'front/routes'

// Css
// migrating the local ourbigbook to webpack: https://github.com/ourbigbook/ourbigbook/issues/157
import 'ourbigbook/editor.scss'
import 'style.scss'

function handleRouteChange(url) {
  window.gtag('config', googleAnalyticsId, {
    page_path: url,
  })
}

const routesThatDontUpdatePrevPageNoSignup = new Set([
 routes.userNew(),
 routes.resetPasswordUpdate(),
])

const MyApp = ({ Component, pageProps }) => {
  const router = useRouter()
  // https://nextjs.org/docs/pages/building-your-application/optimizing/analytics
  useReportWebVitals((metric) => {
    if (log.perf) {
      console.log(metric)
    }
  })

  const [prevPageNoSignup, setPrevPageNoSignup] = useState({ prev: null, cur: null });
  function updatePrevPageNoSignup(newCur, route) {
    // This is so that for logged off user the sequence:
    // - Create new article button
    if (!routesThatDontUpdatePrevPageNoSignup.has(route)) {
      const newVal = {
        prev: prevPageNoSignup.cur,
        cur: newCur,
      }
      setPrevPageNoSignup(newVal)
    }
  }
  useEffect(() => {
      updatePrevPageNoSignup(router?.asPath, router?.route)
    },
    [router?.asPath, router?.route]
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

  const isEditor = !!Component.isEditor
  return (
    <AppContextProvider vals={{ prevPageNoSignup: prevPageNoSignup.prev, updatePrevPageNoSignup }} >
      <div className={`toplevel${isEditor ? ' editor' : ''}`}>
        <Navbar {...{
          isEditor,
          clearScoreDelta: pageProps.clearScoreDelta,
          loggedInUser: pageProps.loggedInUser,
          scoreDelta: pageProps.scoreDelta,
        }} />
        <div className="main">
          <Component {...pageProps} />
        </div>
        {!isEditor &&
          <footer>
            <a href={aboutUrl}><HelpIcon /> About</a>
            <a href={donateUrl}>$ Donate</a>
            <a href={`${docsUrl}#ourbigbook-com-content-license`}>{FontAwesomeIcon(0xf15c)} Content license: CC BY-SA 4.0 unless noted</a>
            <a href="https://github.com/ourbigbook/ourbigbook/tree/master/web">{FontAwesomeIcon(0xf09b, { cls: 'fa-brands-400' })} Website source code</a>
            <a href={contactUrl}><DiscussionIcon /> Contact, bugs, suggestions, abuse reports</a>
            <a href="https://mastodon.social/@ourbigbook">{FontAwesomeIcon(0xf4f6, { cls: 'fa-brands-400' })} @ourbigbook</a>
            <a href="https://twitter.com/OurBigBook">{FontAwesomeIcon(0xf099, { cls: 'fa-brands-400' })} @OurBigBook</a>
            <a href="https://www.youtube.com/@OurBigBook">{FontAwesomeIcon(0xf167, { cls: 'fa-brands-400' })} @OurBigBook</a>
          </footer>
        }
      </div>
    </AppContextProvider>
  )
}

export default MyApp;
