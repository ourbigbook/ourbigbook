import useSWR from 'swr'
import React from 'react'

import checkLogin from 'checkLogin'
import storage from 'storage'

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
