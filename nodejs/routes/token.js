'use strict';

const router = require('express').Router();
const {initOrm} = require('../lib/orm');

const tokens  = async () => {
	const models = await initOrm();
	return {
		auth: models.AuthToken,
		invite: models.Token,
	}
}

router.get('/:name', async function(req, res, next){
	try{
		const map = await tokens();
		const model = map[req.params.name];
		if(!model) throw new Error('unknown token type');

		const results = await (req.query.detail ? model.list() : model.list());

		return res.json({
			results: results.map(r => r.toJSON())
		});
	}catch(error){
		next(error);
	}
});


router.get('/:name/:token', async function(req, res, next){
	try{
		const map = await tokens();
		const model = map[req.params.name];
		if(!model) throw new Error('unknown token type');

		const result = await model.get(req.params.token);
		return res.json({results: result ? result.toJSON() : null});
	}catch(error){
		next(error);
	}
});

module.exports = router;

/*
	verify public ssh key
*/
// router.post('/verifykey', async function(req, res){
// 	let key = req.body.key;

// 	try{
// 		return res.json({
// 			info: await Users.verifyKey(key)
// 		});
// 	}catch(error){
// 		return res.status(400).json({
// 			message: 'Key is not a public key file!'
// 		});
// 	}
	
// });