/* Helper for a link that accepts parameters such as className.
 * Why doesn't Next.js have their own implementation? Who knows!
 * Should be used for every single internal link. */

import Link from 'next/link'
import React from 'react'
import { AppContext, LinkOpensInNewTabIcon } from 'front'

interface CustomLinkProps {
  href?: string;
  className?: string;
  onClick?: (ev: React.MouseEvent<HTMLElement>) => void;
  children: React.ReactNode;
  shallow?: boolean;
  newTab?: boolean;
  newTabIcon?: boolean;
  updatePreviousPage?: boolean;
}

const CustomLink = ({
  children,
  className,
  href,
  newTab=false,
  newTabIcon=true,
  onClick,
  shallow,
  // This should be === true on buttons such as "create new article". These pages would 300 redirect the user,
  // so there would be no time for the _app useEffect to update the next page. So we do it here on click instead upon request.
  // For regular pages that don't 300, that is not needed, as we set the previous page on _app useEffect.
  updatePreviousPage,
}: CustomLinkProps) => {
  if (shallow === undefined) {
    shallow = false;
  }
  const { updatePrevPageNoSignup } = React.useContext(AppContext)
  const innerProps: any = {
    onClick: (ev) => {
      if (updatePreviousPage) {
        updatePrevPageNoSignup(href)
      }
      if (onClick) {
        onClick(ev)
      }
    },
    className,
  }
  if (newTab) {
    innerProps.href = href
    innerProps.target = '_blank'
  }
  const inner = <a {...innerProps}>
    {children}
    {(newTab && newTabIcon) && <> <LinkOpensInNewTabIcon /></>}
  </a>
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
