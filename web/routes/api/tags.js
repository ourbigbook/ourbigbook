const router = require('express').Router()
const { Article } = require('../../models')
const _ = require('underscore')

// return a list of tags
router.get('/', function(req, res, next) {
  Article.findAll({
    attributes: ['tagList']
  })
    .then(function(articles) {
      let tags = articles.reduce(function(allTags, article) {
        return allTags.concat(article.tagList)
      }, [])
      return res.json({ tags: _.uniq(tags) })
    })
    .catch(next)
})

module.exports = router
