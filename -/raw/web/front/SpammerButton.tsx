import React from 'react'

import { LockIcon } from 'front'
import { webApi } from 'front/api'
import ToggleButton from 'front/ToggleButton'

const SpammerButton = ({
  on,
  onSuccess,
  username,
}) => <ToggleButton {...{
  callbackOff: async () => webApi.userMarkSpammer(username),
  contentOff: <><LockIcon /> Spammer</>,
  contentOn: <><LockIcon /> Spammer blocked</>,
  disabledWhenOn: true,
  on,
  onSuccess,
}} />

export default SpammerButton
