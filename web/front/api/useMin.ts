// Helper for the min route. Is this Nirvana?

import { useRouter } from 'next/router'
import useSWR from 'swr'

import fetcher from 'fetcher'
import { SERVER_BASE_URL } from 'constant'
import { minPath } from 'shared'
import getLoggedInUser from 'getLoggedInUser'

export default function useMin(query, assign) {
  const router = useRouter();
  const { data, error } = useSWR(
    `${SERVER_BASE_URL}/${minPath}?query=${JSON.stringify(query)}`,
    fetcher(!router.isFallback && getLoggedInUser() !== undefined)
  );
  if (error) alert('Could not fetch your personalized data')
  if (data) {
    for (let key in assign) {
      for (let i = 0; i < data[key].length; i++) {
        Object.assign(assign[key][i], data[key][i])
      }
    }
  }
}
