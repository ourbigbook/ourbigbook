import React from 'react'
import Router, { useRouter } from 'next/router'

import lodash from 'lodash'

import Label from 'front/Label'

import { boolToQueryVal, encodeGetParams } from 'ourbigbook/web_api'

export default function ShowBody({ setShowBodyState, showBody, showBodyInit }) {
  const router = useRouter();
  const { pathname, query } = router
  const showBodyElem = React.useRef(null)
  React.useEffect(() => {
    // Reset on tab change.
    setShowBodyState(showBodyInit)
    if (showBodyElem.current) {
      showBodyElem.current.checked = showBodyInit
    }
  }, [pathname, encodeGetParams(lodash.omit(query, 'body'))])
  return <Label label="Show body" inline={true}>
    <input
      type="checkbox"
      ref={showBodyElem}
      defaultChecked={showBodyInit}
      onChange={(e) => {
        const showBodyState = e.target.checked
        setShowBodyState(showBodyState)
        const url = new URL(window.location.href)
        const query = Object.fromEntries(url.searchParams)
        if (showBodyState === showBody) {
          delete query.body
        } else {
          query.body = boolToQueryVal(showBodyState)
        }
        Router.push(
          `${url.pathname}${encodeGetParams(query)}`,
          undefined,
          { shallow: true }
        )
      }}
    />
  </Label>
}
