// Helper for the min route. Is this Nirvana?

import { useRouter } from 'next/router'
import useSWR from 'swr'

import { apiPath } from 'front/config'
import fetcher from 'front/fetcher'
import { minPath } from 'front/js'
import useLoggedInUser from 'front/useLoggedInUser'

export default function useMin(query, assign) {
  const router = useRouter();
  const { data, error } = useSWR(
    `${apiPath}/${minPath}?query=${JSON.stringify(query)}`,
    fetcher(!router.isFallback && useLoggedInUser() !== undefined)
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
