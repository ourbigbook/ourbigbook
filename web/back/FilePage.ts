import ourbigbook from 'ourbigbook'
import { parse } from 'node-html-parser'

import { getLoggedInUser } from 'back'
import { getServerSidePropsArticleHoc } from 'back/ArticlePage'
import { MyGetServerSideProps } from 'front/types'

const { convert } = require('convert')

const getArticleProps = getServerSidePropsArticleHoc({ includeIssues: true })

export const getServerSidePropsFile: MyGetServerSideProps = async context => {
  const { params: { uid, path }, req, res } = context
  if (typeof uid !== 'string' || !Array.isArray(path)) return { notFound: true }
  const slug = [uid, ourbigbook.FILE_PREFIX, ...path]
  const { Article, User, Upload } = req.sequelize.models
  // An authored {file} article takes precedence over the automatic preview, just as on static sites.
  if (await Article.findOne({ where: { slug: slug.join('/') }, attributes: ['id'] })) {
    return getArticleProps({ ...context, params: { slug } })
  }
  const author = await User.findOne({ where: { username: uid } })
  if (!author) return { notFound: true }
  const filePath = path.join('/')
  const upload = await Upload.findOne({
    where: { path: Upload.uidAndPathToUploadPath(author.id, filePath) },
  })
  if (!upload) return { notFound: true }
  const loggedInUser = await getLoggedInUser(req, res)
  // Reuse the static {file} renderer for images, video, escaped text and binary notices.
  // This conversion does not create an Article or change the user's article tree.
  const { extra_returns } = await convert({
    author,
    path: `@${slug.join('/')}.${ourbigbook.OURBIGBOOK_EXT}`,
    source: `= ${ourbigbook.ourbigbookEscapeNotStart(filePath)}\n{file}\n`,
    sequelize: req.sequelize,
    splitHeaders: false,
    convertOptionsExtra: {
      auto_generated_source: true,
      hFileShowLarge: true,
      read_file: () => upload.bytes.toString('utf8'),
    },
  })
  const preview = parse(extra_returns.rendered_outputs[Object.keys(extra_returns.rendered_outputs)[0]].full)
  // The page shares its heading and author row with _dir. Keep only the file preview
  // from the static renderer; its h1 render also includes media, so we cannot slice it off.
  preview.querySelector('.h.top')?.remove()
  return { props: {
    filePreview: {
      author: await author.toJson(loggedInUser),
      path: filePath,
      render: preview.toString(),
    },
    ...(loggedInUser ? { loggedInUser: await loggedInUser.toJson(loggedInUser) } : {}),
  } }
}
