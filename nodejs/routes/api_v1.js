'use strict';

const router = require('express').Router();
const middleware = require('../middleware/auth');

router.use('/runner', require('./runner'));
router.use('/worker', require('./worker'));
router.use('/auth', require('./auth'));
router.use('/user', middleware.auth, require('./user'));
router.use('/token',middleware.auth, require('./token'));

module.exports = router;
