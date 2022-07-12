import Link from 'next/link'

import routes from 'front/routes'

export default function FourOhFour() {
  return <div className="article-page">
    <div className="content-not-ourbigbook article-meta">
      <h1>404 Page Not Found</h1>
      <Link href={routes.home()}>
        <a>Go back to the home page?</a>
      </Link>
    </div>
  </div>
}
