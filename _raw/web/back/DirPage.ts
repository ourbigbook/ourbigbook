import { getLoggedInUser } from 'back'
import { DirPageProps } from 'front/DirPage'
import { MyGetServerSideProps } from 'front/types'

export const getServerSidePropsDirHoc = (
  {}
={}): MyGetServerSideProps => {
  return async ({ params: { path, uid }, req, res }) => {
    if (path === undefined) {
      // Root.
      path = ['']
    }
    if (path instanceof Array) {
      const pathString = path.join('/')
      const sequelize = req.sequelize
      const { User, Upload, UploadDirectory } = sequelize.models
      const author = await User.findOne({ where: { username: uid }})
      if (!author) {
        return { notFound: true }
      }
      const [uploadDirectory, loggedInUser] = await Promise.all([
        UploadDirectory.findOne({
          where: { path: Upload.uidAndPathToUploadPath(author.id, pathString) },
          include: [
            {
              model: UploadDirectory,
              as: 'childDirectories',
              attributes: ['path'],
              required: false,
            },
            {
              model: Upload,
              as: 'childFiles',
              attributes: ['path'],
              required: false,
            },
          ],
        }),
        getLoggedInUser(req, res),
      ])
      if (!uploadDirectory) {
        return { notFound: true }
      }
      const [
        authorJson,
        uploadDirectoryJson,
        loggedInUserJson,
      ] = await Promise.all([
        author.toJson(loggedInUser),
        uploadDirectory.toJson(loggedInUser),
        loggedInUser ? loggedInUser.toJson(loggedInUser) : undefined,
      ])

      const props: DirPageProps = {
        author: authorJson,
        uploadDirectory: uploadDirectoryJson,
        childDirectories: uploadDirectory.childDirectories.sort(
          (a, b) => a.path.localeCompare(b.path)
        ).map(d => d.toEntryJson()),
        childFiles: uploadDirectory.childFiles.sort(
          (a, b) => a.path.localeCompare(b.path)
        ).map(f => f.toEntryJson()),
      }
      if (loggedInUser) {
        props.loggedInUser = loggedInUserJson
      }
      return { props }
    } else {
      return { notFound: true }
    }
  }
}
