import React from 'react'

import { webApi } from 'front/api'
import ToggleButton from 'front/ToggleButton'
import { LockIcon, UnlockIcon } from 'front'

const BlacklistSignupIpButton = ({
  ip,
  on,
  onChange,
}) => <ToggleButton {...{
  callbackOff: async () => {
    return webApi.siteSettingsBlacklistSignupIpCreate({ ips: [ip] })
  },
  callbackOn: async () => {
    return webApi.siteSettingsBlacklistSignupIpDelete({ ips: [ip] })
  },
  contentOff: <><LockIcon /> Blacklist signup ip {ip}</>,
  contentOn: <><UnlockIcon /> Unblacklist signup ip {ip}</>,
  on,
  onSuccess: () => onChange && onChange(!on),
}} />

export default BlacklistSignupIpButton
