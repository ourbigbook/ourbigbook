const mime = require('mime')
const Sequelize = require('sequelize')

const { DataTypes } = Sequelize

const { URL_SEP } = require('ourbigbook')
const { hashToHex } = require('ourbigbook/web_api')

const { uploadPathComponent } = require('../front/config')

module.exports = (sequelize) => {
  /**
   * This class represents a directory for Upload.
   * Like in Git, directories cannot be empty, they exist if and only if
   * a file or directory is contained in them. Directories are used for:
   * - checking if a given directory exists for _raw vs _dir differentiation.
   *   In this case, we could find individual directories just by doing a
   *   starts with query as '/path/to/%'. However, what we want is to check
   *   in a single query if multiple files or directories exist, which would imply
   *   a large OR of start which is annoying. Perhaps its not so bad however.
   * - creating _dir directory listings. There is no efficient way of doing this
   *   without a separate table, because if we check just starts with /path/to/%
   *   we can't efficiently differentiate between subdirectories /path/to/subdir/myfile.txt
   *   and things that are directly contained in the directory
   */
  const UploadDirectory = sequelize.define(
    'UploadDirectory',
    {
      path: {
        type: DataTypes.STRING(1024),
        allowNull: false,
        unique: {
          msg: 'path is taken.'
        },
      },
    },
    {
      indexes: [
        { fields: ['createdAt'] },
        { fields: ['updatedAt'] },
        { fields: ['parentId', 'path'] },
      ]
    }
  )
  return UploadDirectory
}
