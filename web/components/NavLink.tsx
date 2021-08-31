import Link from "next/link";
import { useRouter } from "next/router";

interface NavLinkProps {
  href: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

const NavLink = ({ href, onClick, children, className }: NavLinkProps) => {
  const router = useRouter();
  const { asPath } = router;
  const classes = ['nav-link']
  if (encodeURIComponent(asPath) === encodeURIComponent(href)) {
    classes.push('active')
  }
  if (className) {
    classes.push(...className.split(' '))
  }
  return (
    <Link href={href} passHref>
      <a
        onClick={onClick}
        className={classes.join(' ')}
      >
        {children}
      </a>
    </Link>
  );
};

export default NavLink;
