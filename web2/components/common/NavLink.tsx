import Link from "next/link";
import { useRouter } from "next/router";

interface NavLinkProps {
  href: string;
  as: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const NavLink = ({ href, as, onClick, children }: NavLinkProps) => {
  const router = useRouter();
  const { asPath } = router;
  return (
    <Link href={href} as={as} passHref>
      <a
        onClick={onClick}
        className={`${
          encodeURIComponent(asPath) === encodeURIComponent(as) && 'active ' || ''
        }nav-link`}
      >
        {children}
      </a>
    </Link>
  );
};

export default NavLink;
