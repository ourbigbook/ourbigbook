// Singleton table that holds site-wide configs.
// Always contains just one single entry.

const { DataTypes } = require('sequelize')

module.exports = (sequelize) => {
  const Site = sequelize.define(
    'Site',
    {
      automaticTopicLinksMaxWords: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3,
      },
    },
  )

  Site.prototype.toJson = async function(loggedInUser, opts={}) {
    const { transaction } = opts
    const pinnedArticle = this.pinnedArticle ? this.pinnedArticle : await this.getPinnedArticle({ transaction })
    const ret = {
      automaticTopicLinksMaxWords: this.automaticTopicLinksMaxWords,
    }
    if (pinnedArticle) {
      ret.pinnedArticle = pinnedArticle?.slug
    }
    return ret
  }

  return Site
}
