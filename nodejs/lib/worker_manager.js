'use strict';

const { Ssh } = require('./ssh');
const { CodeLandWorker } = require('./codeland');
const { Runner } = require('../models/runner');
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
		this.registry = args.registry || Runner;
		this.sshConfig = args.sshConfig || {};
		this.clworkerConfig = args.clworkerConfig || {};
		this.redis = args.redis || createClient({});
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
		const entry = await this.registry.get(name);
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
		await this.registry.add({
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
		Stop a persistent runner on its current worker, keeping NFS state.
	*/
	async runnerStopPersistent(name){
		const worker = await this.getRunnerWorker(name);
		const runner = worker.runnerGetByName(name);
		await worker.runnerStopPersistent(runner);
		const entry = await this.registry.get(name);
		await entry.update({status: 'stopped'});
	}

	/*
		Migrate a persistent runner from its current worker to a target worker.
		Uses a redis lock so only one worker mounts the NFS delta0 at a time.
	*/
	async runnerMigrate(name, targetHost){
		const entry = await this.registry.get(name);
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
	}
}

module.exports = {WorkerManager};
