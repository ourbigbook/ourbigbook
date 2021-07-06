import CustomLink from "components/common/CustomLink";
import React from "react";

const Footer = () => (
  <footer>
    <div className="container">
      <CustomLink href="/" className="logo-font">
        conduit
      </CustomLink>
      <span className="attribution">
        {" "}© 2021. An interactive learning project from{" "}
        <a href="https://thinkster.io">Thinkster</a>. Code licensed under MIT.
      </span>
    </div>
  </footer>
);

export default Footer;
