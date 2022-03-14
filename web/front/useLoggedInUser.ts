import useSWR from 'swr'
import React from 'react'

import checkLogin from 'checkLogin'
import storage from 'storage'

export default function useLoggedInUser() {
    React.useEffect(() => {})
    const { data: loggedInUser } = useSWR("user", storage);
    if (loggedInUser === undefined) return loggedInUser
    const isLoggedIn = checkLogin(loggedInUser);
    if (isLoggedIn) {
      return loggedInUser;
    } else {
      return null;
    }
}
