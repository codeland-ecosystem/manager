'use strict';

const router = require('express').Router();
const {User} = require('../models/user'); 

router.get('/', async function(req, res, next){
  try{
    return res.json({
      results:  await User[req.query.detail ? "listDetail" : "list"]()
    });
  }catch(error){
    next(error);
  }
});

router.get('/me', async function(req, res, next){
  try{

    return res.json(await User.get({uid: req.user.uid}));
  }catch(error){
    next(error);
  }
});

router.get('/:uid', async function(req, res, next){
  try{
    return res.json({
      results:  await User.get(req.params.uid),
    });
  }catch(error){
    next(error);
  }
});

module.exports = router;
