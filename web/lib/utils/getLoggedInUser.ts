import useSWR from 'swr'
import React from 'react'

import checkLogin from 'lib/utils/checkLogin'
import storage from 'lib/utils/storage'

export default function getLoggedInUser() {
    React.useEffect(() => {})
    const { data: loggedInUser } = useSWR("user", storage);
    const isLoggedIn = checkLogin(loggedInUser);
    if (isLoggedIn) {
      return loggedInUser;
    } else {
      return undefined;
    }
}
