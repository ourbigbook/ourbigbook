import React from 'react'

import { webApi } from 'front/api'
import ToggleButton from 'front/ToggleButton'
import { UnlistedIcon } from 'front'

const UnlistAllArticlesButton = ({
  username,
  on,
}) => <ToggleButton {...{
  callbackOff: async () => {
    return webApi.articlesBulkUpdate({ username }, { list: false })
  },
  contentOff: <><UnlistedIcon /> Unlist all articles</>,
  contentOn: <><UnlistedIcon /> All articles are unlisted</>,
  disabledWhenOn: true,
  on,
}} />

export default UnlistAllArticlesButton
