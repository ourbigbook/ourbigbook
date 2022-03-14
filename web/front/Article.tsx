import Comment from 'front/Comment'
import CommentInput from 'front/CommentInput'
import { CommentType } from 'front/types/commentType'

// This also worked. But using the packaged one reduces the need to replicate
// or factor out the webpack setup of the cirodown package.
//import { cirodown_runtime } from 'cirodown/cirodown_runtime.js';
import { cirodown_runtime } from 'cirodown/dist/cirodown_runtime.js'


function renderRefCallback(elem) {
  if (elem) {
    cirodown_runtime(elem);
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
      className="cirodown"
      ref={renderRefCallback}
    />
    <div className="comments content-not-cirodown">
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
