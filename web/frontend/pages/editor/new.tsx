import makeArticleEditor from "../../components/editor/ArticleEditor";

export async function getStaticProps() {
  return {
    props: {
      article: {
        title: "",
        body: "",
        tagList: [],
      }
    }
  };
};

export default makeArticleEditor(true);
