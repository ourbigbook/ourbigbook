import React from 'react'

import { webApi } from 'front/api'
import ToggleButton from 'front/ToggleButton'
import { LockIcon, UnlockIcon } from 'front'

const LockUserButton = ({
  username,
  on,
}) => {
  return <ToggleButton {...{
    callbackOff: async () => {
      return webApi.userUpdate(username, { locked: true })
    },
    callbackOn: async () => {
      return webApi.userUpdate(username, { locked: false })
    },
    contentOff: <><LockIcon /> Lock</>,
    contentOn: <><UnlockIcon /> Unlock</>,
    on,
  }}/>
}

export default LockUserButton
