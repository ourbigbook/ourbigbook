import { getServerSidePropsEditorHoc } from 'back/EditorPage'
export const getServerSideProps = getServerSidePropsEditorHoc({ isNew: true })
import ArticleEditorPageHoc from 'front/ArticleEditorPage'
export default ArticleEditorPageHoc({ isNew: true })
