/* Helper for a link that accepts parameters such as className.
 * Why doesn't Next.js have their own implementation? Who knows!
 * Should be used for every single internal link. */

import Link from 'next/link'
import React from 'react'
import { AppContext } from 'front'
import useLoggedInUser from 'front/useLoggedInUser'

interface CustomLinkProps {
  href: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  shallow?: boolean;
  newTab?: boolean;
  updatePreviousPage?: boolean;
}

const CustomLink = ({
  children,
  className,
  href,
  newTab=false,
  onClick,
  shallow,
  updatePreviousPage
}: CustomLinkProps) => {
  if (shallow === undefined) {
    shallow = false;
  }
  const { updatePrevPageNoSignup } = React.useContext(AppContext)
  const loggedInUser = useLoggedInUser()
  const innerProps: any = {
    onClick: () => {
      if (updatePreviousPage) {
        if (!loggedInUser) {
          updatePrevPageNoSignup(href)
        }
      }
      if (onClick) {
        onClick()
      }
    },
    className,
  }
  if (newTab) {
    innerProps.href = href
    innerProps.target = '_blank'
  }
  const inner = <a {...innerProps}>{children}</a>
  if (newTab) {
    return inner
  } else {
    return (
      <Link href={href} passHref shallow={shallow} legacyBehavior>
        {inner}
      </Link>
    );
  }
}

export default CustomLink;
