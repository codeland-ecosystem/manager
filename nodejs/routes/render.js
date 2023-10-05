'use strict';

var router = require('express').Router();

/* GET home page. */
router.get('/', async function(req, res, next) {
  res.render('runner', { title: 'Express' });
});

/* GET home page. */

router.get('/topics', function(req, res, next) {
  res.render('topics', { title: 'Express' });
});

router.get('/chat', function(req, res, next) {
  res.render('chat', { title: 'Express' });
});

router.get('/login', function(req, res, next) {
  res.render('login', {redirect: req.query.redirect});
});

router.get('/runner', function(req, res, next) {
  res.render('runner', {});
});

module.exports = router;
