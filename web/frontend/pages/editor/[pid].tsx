import makeArticleEditor from "../../components/editor/ArticleEditor";
import ArticleAPI from "../../lib/api/article";

const editor = makeArticleEditor();

editor.getInitialProps = async ({ query: { pid } }) => {
  const {
    data: { article },
  } = await ArticleAPI.get(pid);
  return { article };
};

export default editor;

// TODO this is the correct way, by directly database access.
// Have to think about how to properly get the backend model here.
//
//import makeArticleEditor from "../../components/editor/ArticleEditor";
//
//export async function getStaticProps({ query: { pid } }) {
//  const {
//    data: { article },
//  } = await ArticleAPI.get(pid);
//  return { props: { article } };
//};
//
//export async function getStaticPaths({ query: { pid } }) {
//  const {
//    data: { article },
//  } = await ArticleAPI.get(pid);
//  return { props: { article } };
//};
//
//export async function getStaticPaths() {
//  return {
//    paths: [
//      { params: { ... } } // See the "paths" section below
//    ],
//    fallback: true
//  };
//  paths: [
//    { params: { id: '1' } },
//    { params: { id: '2' } }
//  ],
//}
//
//export function getAllPostIds() {
//  const fileNames = fs.readdirSync(postsDirectory)
//  return fileNames.map(
//    fileName => {
//      return {
//        params: {
//          id: fileName.replace(/\.md$/, '')
//        }
//      }
//    }
//  )
//}
//
//export default makeArticleEditor();
