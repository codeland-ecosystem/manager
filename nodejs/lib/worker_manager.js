'use strict';

	const { Ssh } = require('./ssh');
	const { CodeLandWorker } = require('./codeland');
	const { initOrm } = require('./orm');
	const { createClient } = require('redis');
	const conf = require('../conf');

/*
	Manages multiple CodeLandWorkers (one per worker host) and a central
	registry mapping persistent runners to their current worker. Routes
	requests to the correct worker and migrates persistent runners between
	workers.

	Persistent runners store their writable layer on shared NFS, so "moving"
	one is: stop on the source worker (keeps NFS state), update the registry,
	then start on the target worker pointing at the same NFS delta0.
*/
class WorkerManager{

	constructor(args){
		this.workers = {};            // host -> CodeLandWorker
		this.sshConfig = args.sshConfig || {};
		this.clworkerConfig = args.clworkerConfig || {};
		this.redis = args.redis || createClient({});
		this.ormReady = args.initOrm ? args.initOrm() : initOrm();
	}

	/*
		Resolve the ORM models (Runner registry). Ensures the ORM is
		initialized before use.
	*/
	async registry(){
		return await this.ormReady;
	}

	/*
		Add a worker for a given host. sshOverrides/clworkerOverrides let each
		worker have its own host, memTarget, etc.
	*/
	addWorker(host, sshOverrides={}, clworkerOverrides={}){
		const ssh = new Ssh({...this.sshConfig, host, ...sshOverrides});
		const worker = new CodeLandWorker({
			ssh,
			...this.clworkerConfig,
			...clworkerOverrides,
		});
		this.workers[host] = worker;
		return worker;
	}

	getWorker(host){
		return this.workers[host];
	}

	/*
		Return the worker currently hosting a persistent runner, based on the
		registry.
	*/
	async getRunnerWorker(name){
		const Runner = (await this.registry()).Runner;
		const entry = await Runner.get(name);
		if(!entry) throw this.errors.runnerNotFound(name);
		const worker = this.workers[entry.worker];
		if(!worker) throw this.errors.workerNotFound(entry.worker);
		return worker;
	}

	/*
		Create a persistent runner on a specific worker and register it.
	*/
	async runnerMakePersistent(name, memLimit, host){
		const worker = this.workers[host];
		if(!worker) throw this.errors.workerNotFound(host);

		const runner = await worker.runnerMakePersistent(name, memLimit);
		const Runner = (await this.registry()).Runner;
		await Runner.create({
			name,
			worker: host,
			type: 'persistent',
			status: 'running',
		});
		return runner;
	}

	/*
		Run code on a persistent runner, routing to its current worker.
	*/
	async runnerRunPersistent(name, code, time){
		const worker = await this.getRunnerWorker(name);
		const runner = worker.runnerGetByName(name);
		return worker.runnerRun(runner, code, time);
	}

	/*
		Resolve a runner by name across all registered workers. Checks the
		registry first (persistent runners), then falls back to each worker's
		in-memory __runners map (ephemeral runners). Returns {worker, runner}
		or throws runnerNotFound.
	*/
	async getRunnerAnywhere(name){
		// Persistent runners are in the registry.
		try{
			const worker = await this.getRunnerWorker(name);
			const runner = worker.runnerGetByNameSafe(name);
			if(runner) return {worker, runner};
		}catch(error){
			if(error.name !== 'runnerNotFound') throw error;
		}

		// Ephemeral runners live in a worker's in-memory map.
		for(const worker of Object.values(this.workers)){
			const runner = worker.runnerGetByNameSafe(name);
			if(runner) return {worker, runner};
		}

		throw this.errors.runnerNotFound(name);
	}

	/*
		Run code on any runner (persistent or ephemeral), routing to the worker
		that currently hosts it.
	*/
	async runnerRunAnywhere(name, code, time){
		const {worker, runner} = await this.getRunnerAnywhere(name);
		return worker.runnerRun(runner, code, time);
	}

	/*
		Inspect any runner (persistent or ephemeral), routing to the worker
		that currently hosts it.
	*/
	async runnerInfoAnywhere(name){
		const {worker, runner} = await this.getRunnerAnywhere(name);
		return {
			...(await runner.info()),
			lastStatus: runner.lastStatus,
			domain: runner.domain,
			statusHistory: runner.statusHistory,
		};
	}

	/*
		Free (destroy) any runner (persistent or ephemeral), routing to the
		worker that currently hosts it.
	*/
	async runnerFreeAnywhere(name){
		const {worker, runner} = await this.getRunnerAnywhere(name);
		await worker.runnerFree(runner);
		return true;
	}

	/*
		Rehydrate persistent runners after a manager restart. The registry
		persists across restarts, but each worker's in-memory __runners map is
		empty, so runnerRunPersistent would fail. Start every registry entry
		marked 'running' on its registered worker so persistent runners are
		usable again without manual intervention.
	*/
	async rehydrate(){
		const Runner = (await this.registry()).Runner;
		const entries = await Runner.list();
		let started = 0;
		let failed = 0;

		for(const entry of entries){
			if(entry.status !== 'running') continue;

			const worker = this.workers[entry.worker];
			if(!worker){
				console.error(`rehydrate: no worker registered for ${entry.worker} (runner ${entry.name})`);
				failed++;
				continue;
			}

			try{
				// If the runner is already tracked (e.g. this worker just
				// created it), skip.
				if(worker.runnerGetByNameSafe && worker.runnerGetByNameSafe(entry.name)) continue;
				await worker.runnerMakePersistent(entry.name);
				started++;
			}catch(error){
				console.error(`rehydrate: failed to start ${entry.name} on ${entry.worker}:`, error.message);
				failed++;
			}
		}

		console.log(`rehydrate: started ${started} persistent runner(s), ${failed} failed`);
		return {started, failed};
	}

	/*
		Stop a persistent runner on its current worker, keeping NFS state.
	*/
	async runnerStopPersistent(name){
		const worker = await this.getRunnerWorker(name);
		const runner = worker.runnerGetByName(name);
		await worker.runnerStopPersistent(runner);
		const Runner = (await this.registry()).Runner;
		const entry = await Runner.get(name);
		await entry.update({status: 'stopped'});
	}

	/*
		Migrate a persistent runner from its current worker to a target worker.
		Uses a redis lock so only one worker mounts the NFS delta0 at a time.
	*/
	async runnerMigrate(name, targetHost){
		const Runner = (await this.registry()).Runner;
		const entry = await Runner.get(name);
		if(!entry) throw this.errors.runnerNotFound(name);
		const sourceHost = entry.worker;
		if(sourceHost === targetHost) return entry;

		const sourceWorker = this.workers[sourceHost];
		const targetWorker = this.workers[targetHost];
		if(!sourceWorker) throw this.errors.workerNotFound(sourceHost);
		if(!targetWorker) throw this.errors.workerNotFound(targetHost);

		// Acquire a migration lock to prevent concurrent mounts of the same
		// NFS delta0 on two workers.
		const lockKey = `cl:runner:lock:${name}`;
		const acquired = await this.redis.set(lockKey, 'migrating', {NX: true, EX: 60});
		if(!acquired) throw this.errors.runnerBusy(name);

		try{
			// Stop on the source worker (keeps NFS state).
			const runner = sourceWorker.runnerGetByName(name);
			await sourceWorker.runnerStopPersistent(runner);

			// Update the registry to point at the target worker.
			await entry.update({worker: targetHost, status: 'migrating'});

			// Start on the target worker, pointing at the same NFS delta0.
			const newRunner = await targetWorker.runnerMakePersistent(name);
			await entry.update({status: 'running'});

			return newRunner;
		}finally{
			await this.redis.del(lockKey);
		}
	}

	errors = {
		workerNotFound: (host)=>{
			const error = new Error('workerNotFound');
			error.name = 'workerNotFound';
			error.message = `The worker ${host} is not registered`;
			error.status = 404;
			return error;
		},
		runnerBusy: (name)=>{
			const error = new Error('runnerBusy');
			error.name = 'runnerBusy';
			error.message = `The runner ${name} is currently being migrated`;
			error.status = 409;
			return error;
		},
		runnerNotFound: (name)=>{
			const error = new Error('runnerNotFound');
			error.name = 'runnerNotFound';
			error.message = `The runner ${name} is not in the registry`;
			error.status = 404;
			return error;
		},
	}
}

module.exports = {WorkerManager};
