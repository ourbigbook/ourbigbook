import React from 'react'

import { ErrorIcon } from 'front'

const ErrorList = ({ errors }) => {
  if (errors.length) {
    return <div className="error-messages">
      {errors.map((e, i) => <div key={i}><ErrorIcon /> {e}</div>)}
    </div>
  } else {
    return <></>
  }
}

export default ErrorList;
