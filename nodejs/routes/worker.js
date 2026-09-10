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
		next(error);
	}
})

router.delete('/zombies', (req, res, next)=>{
	try{
		clworker.deleteUntrackedRunners()
		res.json({res: 'working...'})
	}catch(error){
		next(error);
	}
})

/*
	Metrics endpoint: runner counts, oven state, and recent job history.
*/
router.get('/metrics', async (req, res, next)=>{
	try{
		const runners = Object.values(clworker.__runners);
		const available = runners.filter(r => r.lastStatus && r.lastStatus.status === 'available').length;
		const inUse = runners.filter(r => r.lastStatus && r.lastStatus.status === 'inUse').length;
		const cooking = clworker.runnersCooking || 0;

		res.json({
			worker: clworker.ssh.host,
			environment: conf.environment,
			startedAt: clworker.startedAt.getTime(),
			uptimeSeconds: Math.floor((Date.now() - clworker.startedAt.getTime()) / 1000),
			runners: {
				total: runners.length,
				available,
				inUse,
				cooking,
			},
			oven: clworker.ovenStatus,
			history: clworker.history || [],
		});
	}catch(error){
		next(error);
	}
})

/*
	Oven controls: pause/resume cooking, set the standby target, and drain.
*/
router.post('/oven/pause', (req, res, next)=>{
	try{
		res.json(clworker.ovenPause());
	}catch(error){
		next(error);
	}
});

router.post('/oven/resume', (req, res, next)=>{
	try{
		res.json(clworker.ovenResume());
	}catch(error){
		next(error);
	}
});

router.post('/oven/min', (req, res, next)=>{
	try{
		res.json(clworker.ovenSetMin(req.body.min));
	}catch(error){
		next(error);
	}
});

router.post('/oven/drain', async (req, res, next)=>{
	try{
		res.json(await clworker.ovenDrainNow());
	}catch(error){
		next(error);
	}
});

router.post('/oven/undrain', (req, res, next)=>{
	try{
		res.json(clworker.ovenUndrain());
	}catch(error){
		next(error);
	}
});

module.exports = router;
