import React from 'react'

import { ErrorIcon } from 'front'

const ErrorList = ({ errors }) => {
  let inner
  if (errors instanceof Array) {
    if (errors.length) {
      inner = <>{errors.map((e, i) => <div key={i}><ErrorIcon /> {e}</div>)}</>
    }
  } else if (typeof errors === 'string') {
    inner = errors
  }
  if (inner === undefined) {
    return <></>
  } else {
    return <div className="error-messages">
      {inner}
    </div>
  }
}

export default ErrorList;
