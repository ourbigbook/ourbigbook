import Link from 'next/link'

import routes from 'front/routes'
import CustomLink from 'front/CustomLink'

export default function FourOhFour() {
  return <div className="article-page">
    <div className="content-not-ourbigbook article-meta">
      <h1>404 Page Not Found</h1>
      <CustomLink href={routes.home()}>
        Go back to the home page?
      </CustomLink>
    </div>
  </div>
}
