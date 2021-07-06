import Head from "next/head"
import React from "react"

import Footer from "components/common/Footer"
import Navbar from "components/common/Navbar"
import ContextProvider from "lib/context"
import 'cirodown/cirodown.scss'
import 'katex/dist/katex.css'
// TODO Uncaught ReferenceError: Tablesort is not defined
//https://github.com/tristen/tablesort/issues/165
//import 'tablesort/src/tablesort.js'
//import 'tablesort/src/sorts/tablesort.date.js'
//import 'tablesort/src/sorts/tablesort.dotsep.js'
//import 'tablesort/src/sorts/tablesort.filesize.js'
//import 'tablesort/src/sorts/tablesort.monthname.js'
//import 'tablesort/src/sorts/tablesort.number.js'
import "style.scss"

const MyApp = ({ Component, pageProps }) => (
  <>
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
    </Head>
    <ContextProvider>
      <Navbar />
      <Component {...pageProps} />
      <Footer />
    </ContextProvider>
  </>
);

export default MyApp;
