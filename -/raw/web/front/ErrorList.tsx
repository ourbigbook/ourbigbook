import React from 'react'

import { ErrorIcon, OkIcon, TimeIcon  } from 'front'

export default function ErrorList({
  errors,
  inline=false,
  loading=undefined,
  oks=undefined,
}) {
  let inner
  const inlineClass = inline ? 'inline' : ''
  const inlineClassSpace = inline ? ' inline' : ''
  if (errors instanceof Array) {
    if (errors.length) {
      inner = <>{errors.map((e, i) => <div key={i} className={inlineClass}><ErrorIcon /> {e}</div>)}</>
    }
  } else if (typeof errors === 'string') {
    inner = <><ErrorIcon /> {errors}</>
  }
  if (oks !== undefined && oks.length) {
    inner = <></>
  }
  if (loading) {
    return <div className={`loading${inlineClassSpace}`}><TimeIcon /> Loading</div>
  } else {
    return <>
      {(oks !== undefined && oks.length !== 0) &&
        <div className={`ok-messages${inlineClassSpace}`}>
          {oks.map((e, i) => <div key={i}><OkIcon /> {e}</div>)}
        </div>
      }
      {(inner !== undefined) &&
        <div className={`error-messages${inlineClassSpace}`}>
          {inner}
        </div>
      }
    </>
  }
}
