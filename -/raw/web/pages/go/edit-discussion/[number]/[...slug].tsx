import { getServerSidePropsEditorHoc } from 'back/EditorPage'
export const getServerSideProps = getServerSidePropsEditorHoc({ isIssue: true });
import EditorPageHoc from 'front/EditorPage'
export default EditorPageHoc({ isIssue: true });
