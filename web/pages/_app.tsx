import Head from "next/head"
import React from "react"

import Footer from "components/common/Footer"
import Navbar from "components/common/Navbar"
import ContextProvider from "lib/context"

import 'ionicons/css/ionicons.min.css'

// migrating the local cirodown to webpack: https://github.com/cirosantilli/cirodown/issues/157
import 'cirodown/dist/cirodown.css'
import 'cirodown/editor.scss'
import 'style.scss'

const MyApp = ({ Component, pageProps }) => (
  <>
    <ContextProvider>
      <Navbar />
      <Component {...pageProps} />
      <Footer />
    </ContextProvider>
  </>
);

export default MyApp;
