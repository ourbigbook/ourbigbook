/* Helper for a link that accepts parameters such as className.
 * Why doesn't Next.js have their own implementation? Who knows!
 * Should be used for every single internal link. */

import Link from 'next/link'
import React from 'react'

interface CustomLinkProps {
  href: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  shallow?: boolean;
  newTab?: boolean;
}

const CustomLink = ({
  children,
  className,
  href,
  newTab=false,
  onClick,
  shallow,
}: CustomLinkProps) => {
  if (shallow === undefined) {
    shallow = false;
  }
  const innerProps: any = {
    onClick,
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
    return <Link href={href} passHref shallow={shallow}>
      {inner}
    </Link>
  }
}

export default CustomLink;
