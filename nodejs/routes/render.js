'use strict';

var router = require('express').Router();
const conf = require('../conf')

const values ={
  title: conf.environment !== 'production' ? ` -- ${conf.environment}` : ''
}

/* GET home page. */
router.get('/', async function(req, res, next) {
  res.render('runner', {...values});
});

/* GET home page. */

router.get('/topics', function(req, res, next) {
  res.render('topics', {...values});
});

router.get('/chat', function(req, res, next) {
  res.render('chat', {...values});
});

router.get('/login', function(req, res, next) {
  res.render('login', {redirect: req.query.redirect, ...values});
});

router.get('/runner', function(req, res, next) {
  res.render('runner', {...values});
});

module.exports = router;
