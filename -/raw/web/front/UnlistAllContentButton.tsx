import React from 'react'

import { webApi } from 'front/api'
import ToggleButton from 'front/ToggleButton'
import { UnlistedIcon } from 'front'

const UnlistAllContentButton = ({
  username,
  on,
}) => <ToggleButton {...{
  callbackOff: async () => {
    return webApi.userUnlistContent(username)
  },
  contentOff: <><UnlistedIcon /> Unlist all content</>,
  contentOn: <><UnlistedIcon /> All content is unlisted</>,
  disabledWhenOn: true,
  on,
}} />

export default UnlistAllContentButton
