'use strict';

const router = require('express').Router();
const {Auth, AuthToken} = require('../models/auth');
const {initOrm} = require('../lib/orm');
const {auth} = require('../middleware/auth');


router.post('/login', async function(req, res, next){
	try{
		let auth = await Auth.login(req.body);
		return res.json({
			login: true,
			token: auth.token.token,
			message:`${req.body.uid} logged in!`,
		});
	}catch(error){
		next(error);
	}
});

router.all('/logout', async function(req, res, next){
	try{
		if(req.user){
			await Auth.logOut({token: req.header('auth-token')});
		}

		res.json({message: 'Bye'})
	}catch(error){
		next(error);
	}
});

/*
	Mint a new API token for the current user. Useful for scripts/CLI.
	Requires an authenticated request (auth middleware sets req.user).
*/
router.post('/token', auth, async function(req, res, next){
	try{
		if(!req.user) throw Object.assign(new Error('Not authenticated'), {status: 401});
		const {AuthToken} = await initOrm();
		const token = await AuthToken.create({created_by: req.user.uid || req.user.dn});
		return res.json({token: token.token});
	}catch(error){
		next(error);
	}
});

module.exports = router;
