import useSWR from "swr";

import checkLogin from "lib/utils/checkLogin";
import storage from "lib/utils/storage";

export default function getLoggedInUser() {
    const { data: loggedInUser } = useSWR("user", storage);
    const isLoggedIn = checkLogin(loggedInUser);
    if (isLoggedIn) {
      return loggedInUser;
    } else {
      return undefined;
    }
}
