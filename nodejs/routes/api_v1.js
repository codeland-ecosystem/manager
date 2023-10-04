'use strict';

const router = require('express').Router();

router.use('/runner', require('./runner'));
router.use('/user', require('./user'));

module.exports = router;
