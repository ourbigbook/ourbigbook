import React from 'react'

import { SeeIcon } from 'front'

export function ItemBody({ children, showFullBody }) {
  const itemBody = React.useRef(null)
  const [showButton, setShowButton] = React.useState(true)
  return <div className={`item-body${showFullBody ? '' : ' cut'}`} ref={itemBody}>
    {(!showFullBody && showButton) &&
      <div className="show-more">
        <a onClick={(ev) => {
          ev.preventDefault()
          setShowButton(false)
          itemBody.current.classList.remove('cut')
        }} >
          <SeeIcon /> View more
        </a>
      </div>
    }
    {children}
  </div>
}
