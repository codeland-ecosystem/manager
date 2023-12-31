'use strict';

const router = require('express').Router();
const {clworker} = require('../controller/codeland');
const conf = require('../conf');

/*
	git rev-parse HEAD 2>/dev/null && git diff-index --quiet HEAD -- || echo "Uncommitted changes"
	275df908e0781514c62aeb53a5a99fcad2d9c393
	Uncommitted changes
*/
router.get('/', async(req, res, next)=>{
	res.json({
		worker:{
			location: clworker.ssh.host,
			user: clworker.ssh.user,
			userHasKey: !!clworker.ssh.keyPath,
			startedAt: clworker.startedAt.getTime(),
			environment: conf.environment,
		},
		oven: clworker.ovenStatus,
		memory: await clworker.ssh.memory(),
		df: (await clworker.ssh.df())['/'],
	})
});

router.get('/zombies', async (req, res, next)=>{
	try{
		res.json({res: await clworker.getCurrentCopies()})
	}catch(error){
		next(err);
	}
})

router.delete('/zombies', (req, res, next)=>{
	try{
		clworker.deleteUntracedRunners()
		res.json({res: 'working...'})
	}catch(error){
		next(err);
	}
})

module.exports = router;
