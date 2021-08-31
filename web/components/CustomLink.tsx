/* Helper for a link that accepts parameters such as className */

import Link from "next/link";
import React from "react";

interface CustomLinkProps {
  href: string;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  shallow?: boolean;
}

const CustomLink = ({
  className,
  href,
  onClick,
  children,
  shallow,
}: CustomLinkProps) => {
  if (shallow === undefined) {
    shallow = false;
  }
  return (<Link href={href} passHref shallow={shallow}>
    <a onClick={onClick} className={className || ""}>
      {children}
    </a>
  </Link>)
}

export default CustomLink;
