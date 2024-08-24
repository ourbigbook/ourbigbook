import React from 'react'

import { ErrorIcon, OkIcon, TimeIcon  } from 'front'

const ErrorList = ({
  errors,
  loading=undefined,
  notErrors=undefined,
}) => {
  let inner
  if (errors instanceof Array) {
    if (errors.length) {
      inner = <>{errors.map((e, i) => <div key={i}><ErrorIcon /> {e}</div>)}</>
    }
  } else if (typeof errors === 'string') {
    inner = errors
  }
  if (notErrors !== undefined && notErrors.length) {
    inner = <></>
  }
  if (loading) {
    return <div className="loading"><TimeIcon /> Loading</div>
  } else {
    return <>
      {(notErrors !== undefined && notErrors.length) &&
        <div className="ok-messages">
          {notErrors.map((e, i) => <div key={i}><OkIcon /> {e}</div>)}
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

export default ErrorList;
