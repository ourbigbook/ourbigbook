import React from 'react'
import Router from 'next/router'

import Label from 'front/Label'

import { boolToQueryVal, encodeGetParams } from 'ourbigbook/web_api'

export default function ShowBody({ setShowBodyState, showBody, showBodyState }) {
  const showBodyElem = React.useRef(null)
  if (showBodyElem.current) {
    showBodyElem.current.checked = showBodyState
  }
  return <Label label="Show body" inline={true}>
    <input
      type="checkbox"
      ref={showBodyElem}
      defaultChecked={showBodyState}
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
