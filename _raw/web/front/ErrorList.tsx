import React from 'react'

import { ErrorIcon, OkIcon, TimeIcon  } from 'front'

export default function ErrorList({
  errors,
  loading=undefined,
  oks=undefined,
}) {
  let inner
  if (errors instanceof Array) {
    if (errors.length) {
      inner = <>{errors.map((e, i) => <div key={i}><ErrorIcon /> {e}</div>)}</>
    }
  } else if (typeof errors === 'string') {
    inner = <><ErrorIcon /> {errors}</>
  }
  if (oks !== undefined && oks.length) {
    inner = <></>
  }
  if (loading) {
    return <div className="loading"><TimeIcon /> Loading</div>
  } else {
    return <>
      {(oks !== undefined && oks.length !== 0) &&
        <div className="ok-messages">
          {oks.map((e, i) => <div key={i}><OkIcon /> {e}</div>)}
        </div>
      }
      {(inner !== undefined) &&
        <div className="error-messages">
          {inner}
        </div>
      }
    </>
  }
}
