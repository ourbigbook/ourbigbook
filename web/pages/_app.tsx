import Layout from "components/layout"
import ContextProvider from "lib/context"

import 'ionicons/css/ionicons.min.css'

// migrating the local cirodown to webpack: https://github.com/cirosantilli/cirodown/issues/157
import 'cirodown/dist/cirodown.css'
import 'cirodown/editor.scss'
import 'style.scss'

const MyApp = ({ Component, pageProps }) => {
  return (
    <>
      <ContextProvider>
        <Layout isEditor={!!Component.isEditor}>
          <Component {...pageProps} />
        </Layout>
      </ContextProvider>
    </>
  )
}

export default MyApp;
