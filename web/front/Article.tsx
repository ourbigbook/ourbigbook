import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import { CommentType } from 'front/types/commentType'

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the ourbigbook package.
//import { ourbigbook_runtime } from 'ourbigbook/ourbigbook_runtime.js';
import { ourbigbook_runtime } from 'ourbigbook/dist/ourbigbook_runtime.js'


function renderRefCallback(elem) {
  if (elem) {
    ourbigbook_runtime(elem);
  }
}

const Article = ({
  article,
  comments,
}) => {
  const markup = { __html: article.render };
  return <>
    <div
      dangerouslySetInnerHTML={markup}
      className="ourbigbook"
      ref={renderRefCallback}
    />
    <div className="comments content-not-ourbigbook">
      <h1>Comments</h1>
      <div>
        <CommentInput />
        {comments?.map((comment: CommentType) => (
          <Comment key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  </>
}
export default Article
