import makeArticleEditor from "components/editor/ArticleEditor";

import { getStaticPropsArticle } from "lib/article";

// Backend only.

import sequelize from "lib/db";

export const getServerSideProps = getStaticPropsArticle();

export default makeArticleEditor();
