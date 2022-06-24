import ArticleEditorPageHoc from 'front/ArticleEditorPage'
import { getServerSidePropsIssueHoc } from 'back/IssuePage'
export const getServerSideProps = getServerSidePropsIssueHoc();
export default ArticleEditorPageHoc({ isIssue: true });
