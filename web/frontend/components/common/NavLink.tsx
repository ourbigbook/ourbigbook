import styled from "@emotion/styled";
import Link from "next/link";
import { useRouter } from "next/router";

interface NavLinkProps {
  href: string;
  as: string;
  onClick?: () => void;
  children: React.ReactNode;
}

const Anchor = styled("a")`
  text-decoration: none;
`;

const NavLink = ({ href, as, onClick, children }: NavLinkProps) => {
  const router = useRouter();
  const { asPath } = router;

  return (
    <Link href={href} as={as} passHref>
      <Anchor
        onClick={onClick}
        className={`${
          encodeURIComponent(asPath) === encodeURIComponent(as) && `active`
        }`}
      >
        {children}
      </Anchor>
    </Link>
  );
};

export default NavLink;
