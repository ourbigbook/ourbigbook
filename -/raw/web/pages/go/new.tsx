import { getServerSidePropsEditorHoc } from 'back/EditorPage'
export const getServerSideProps = getServerSidePropsEditorHoc()
import EditorPageHoc from 'front/EditorPage'
export default EditorPageHoc({ isNew: true });
