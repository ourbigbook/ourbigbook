// Singleton table that holds site-wide configs.
// Always contains just one single entry.

const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Site = sequelize.define(
    'Site',
    {},
  )

  Site.prototype.toJson = async function(loggedInUser) {
    const pinnedArticle = this.pinnedArticle ? this.pinnedArticle : await this.getPinnedArticle()
    const ret = {}
    if (pinnedArticle) {
      ret.pinnedArticle = pinnedArticle?.slug
    }
    return ret
  }

  return Site
}
