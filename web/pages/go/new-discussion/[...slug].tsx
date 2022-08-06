import { getServerSidePropsEditorHoc } from 'back/EditorPage'
export const getServerSideProps = getServerSidePropsEditorHoc({ isIssue: true });
import ArticleEditorPageHoc from 'front/ArticleEditorPage'
export default ArticleEditorPageHoc({ isIssue: true, isNew: true });
