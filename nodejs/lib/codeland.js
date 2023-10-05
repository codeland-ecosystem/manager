'use strict';

const axios = require('axios');
const { Ssh } = require('./ssh');
const { LXC } = require('./lxc');
const conf = require('../conf')
const ps = require('../controller/pubsub.js'); 

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/*
	Manage the runners on a worker VM/Server for the Codeland API.
*/
class CodeLandWorker{

	/*
		Hold the error messages that can be used with this class
	*/
	errors = {
		runnerNotAvailable: ()=>{
			const error = new Error('RunnerNotAvailable');
			error.name = 'RunnerNotAvailable';
			error.message = 'No fresh runners at this time, please try again later';
			error.status = 503;
			return error;
		},
		runnerTimedOut: (time, runner)=>{
			const error = new Error('runnerTimedOut');
			error.name = 'runnerTimedOut';
			error.message = `The Execution time was longer then the timeout of ${time} seconds`;
			error.status = 498;
			error.runner = runner;
			return error;
		},
		runnerExecutionFailed: (runner)=>{
			const error = new Error('runnerExecutionFailed');
			error.name = 'runnerExecutionFailed';
			error.message = `The Execution on ${runner.name} failed for unknown reasons`;
			error.status = 400;
			error.runner = runner;
			return error;
		},
		runnerNotFound: (runnerName)=>{
			const error = new Error('runnerNotFound');
			error.name = 'runnerNotFound';
			error.message = `The requested runner, ${runnerName} can not be found`;
			error.status = 404;
			return error;
		},
	}

	__log(topic, message){
		ps.publish(`cl:worker:${topic}`, message);
		console.log(topic, ...Object.entries(message).map(([k, v]) => `${k}: ${v}`));
	}

	/*
		In order to guarantee the passed LXC template is valid, we must make
		async calls, so this the the correct method to make new Code land
		instances.
	*/
	static async new(args){
		let instance = new this(args);
		instance.runnerTemplate = await LXC.get({
			name: instance.runnerTemplate,
			execInstance: instance.ssh
		});

		await instance.runnerTemplate.info()

		return instance;
	}

	constructor(args){
		// Hold the ssh connection to allow remote code execution on the worker.
		this.ssh = args.ssh;

		// Hold the base template for new runners
		this.runnerTemplate = args.runnerTemplate;

		// Set the prefix for cloned runners
		this.runnerPrefix = args.runnerPrefix || `${this.runnerTemplate}-${conf.environment}-`;
		
		// Default memory target for runner creation
		this.memTarget = args.memTarget || 50;

		// How many runners should be created regardless of memory usage
		this.minAvailableRunners = args.minAvailableRunners || 3;

		//
		this.pubsun = ps

		// Hold the list of current runners
		this.__runners = {};

		// Keep track how many runners are currently in creation
		this.__runnersOnBackBunner = 0;
	}

	/*
		Get the memory info from the worker server.
	*/
	async memory(){
		let res = await this.ssh.exec(
			"head /proc/meminfo|grep MemFree|grep -Po '\\d+'; head /proc/meminfo|grep MemTotal|grep -Po '\\d+'",
		);

		let available = Number(res.stdout.split('\n')[0]);
		let total = Number(res.stdout.split('\n')[1]);
		let used = total - available;
		let percent = (used/total)*100;

		this.__log('memory', {
			total,
			available,
			used,
			percent,
		});

		return {
			total,
			available,
			used,
			percent,
		}
	}

	/*
		getCurrentCopies and deleteUntracedRunners clean up zombie runners from
		old instances of Codeland
	*/
	async getCurrentCopies(){
		let containers = await this.runnerTemplate.list();
		let runners = {};
		for(let container of containers){
			if(container.name.startsWith(this.runnerPrefix ) ){
				if(container.name === this.runnerTemplate) continue;
				runners[container.name] = await this.runnerTemplate.constructor.get({
					name: container.name,
					execInstance: this.ssh,
				});
			}
		}

		return runners;
	}

	async deleteUntracedRunners(){
		for(let [name, runner] of Object.entries(await this.getCurrentCopies())){
			if(!this.__runners[name]){
				// this.__log('runner:delete', {
				// 	runner: name,
				// 	reason: 'zombie'
				// })
				// await runner.destroy();

				this.runnerFree(runner, false)
				await sleep(1000);

			}
		}
	}

	/*
		Make new runners, wait for them to be ready and add them to the array
		of usable runners.

		Todo:
		Test to make sure the crunner is working.
	*/
	async runnerMake(){
		let name = this.runnerPrefix + (Math.random()*100).toString().slice(-5);
		this.__runnersOnBackBunner++;
		let runner = await this.runnerTemplate.copy(name, true);
		while(!(await runner.info()).ip) await sleep(250);

		this.__runnersOnBackBunner--;
		
		this.__log('runner:new', {
			runner: runner.name
		});
		return runner;
	}

	/*
		Auto populate the array of available runners. The percent of used memory
		or the minimum required runners are used to decide if more need to be
		created. Since runner creation is an async job, the number of in flight
		creations are tracked and limited.

		In order to speed up creation, several runners are created at once. 
	*/
	async runnerFill(){
		let errorCount = 0;
		while(true){
			let memory = await this.memory()
			let message = {
					runnersOnBackBunner: this.__runnersOnBackBunner,
					AvailableRunners: Object.keys(this.__runners).length,
			}

			if(this.__runnersOnBackBunner > this.minAvailableRunners){
				this.__log('runner:fill:stop', {
					...message,
					message: `stopping to many in the oven`
				});
				break;
			}else if(this.minAvailableRunners > Object.keys(this.__runners).length){
				this.__log('runner:fill:start', {
					...message,
					message: 'Not enough runners, forcing to make more'
				});

			}else if(memory.percent > this.memTarget) {
				this.__log('runner:fill:start', {
					...message,
					message: 'stopping above memory percent'
				});
				break
			}

			try{
				const createRunnersAsync = (count) => Promise.all(Array.from({ length: count }, () => this.runnerMake()));
				let runners = await createRunnersAsync(this.minAvailableRunners/2);

				for(let runner of runners){
					this.__runners[runner.name] = runner;

					this.__log('runner:fill:success', {
						...message,
						message: `created ${runner.name} runner for fill, count now ${Object.keys(this.__runners).length}`
					});
					break
				}
			}catch(error){
				this.__log('runner:fill:error', {
					...message,
					message: `error count ${errorCount}`,
					error: error
				});

				continue;
			}
			await sleep(250);
		}
	}

	/*
		Once a runner is not longer needed, clean up any attached timers and
		free its resources. runnerFill is called to make check if a
		replenishment is required 
	*/
	async runnerFree(runner, fill=true){
		this.__log('runner:free', {
			message: `Freeing runner`,
			runner: runner ? runner.name : ''
		});

		if(!(runner instanceof LXC)){
			this.__log('runner:free:error:badInstance', {
				error: `runner not instanceof LXC`,
				runner: runner
			});

			if(this.__runners[runner]) delete this.__runners[runner];
			return false;
		}
		let name = runner.name;

		if(this.__runners[runner.name]){
			delete this.__runners[name];
		}

		if(runner.hasOwnProperty('timeout')){
			clearTimeout(runner.timeout);
		}
		await runner.destroy();
		if(fill) this.runnerFill();
		this.__log('runner:free:success', {
			message: `done`,
			runner: name
		});
	}

	/*
		Get a runner for use.
	*/
	runnerPop(){
		for(let [name, runner] of Object.entries(this.__runners)){
			if(!runner.inUse){
				runner.inUse = true;

				this.__log('runner:inUse', {
					message: `This runner has moved to be in use`,
					runner: runner ? runner.name : ''
				});

				return runner
			}
		}

		throw this.errors.runnerNotAvailable();
	}

	/*
		Return the named runner, and throw an error if the named runner is not
		found.
	*/
	runnerGetByName(name){
		let runner = this.__runners[name];
		if(runner) return runner;
		throw this.errors.runnerNotFound(name);
	}

	/*
		Execute code on the remote runner via the crunner API.
	*/
	async runnerRun(runner, code){
		try{
			let res = await axios.post(`http://${this.ssh.host}/`, {
				code: code
			}, {
				headers: {
					Host: runner.name
				}
			});

			return res.data;
		}catch(error){
			throw this.errors.runnerExecutionFailed(runner)
		}
	}

	/*
		Execute code on new runner, then kill it.
	*/
	runnerRunOnce(code, time=60){
		return new Promise(async (resolve, reject)=>{
			try{
				console.log('runnerRunOnce', time);
				let runner = await this.runnerPop();

				runner.timeout = setTimeout((runner)=>{
					console.log('runnerRunOnce timed out', runner.name);
					reject(this.errors.runnerTimedOut(time, runner));
					this.runnerFree(runner)
				}, time*1000, runner)

				let res = await this.runnerRun(runner, code);
				this.runnerFree.call(this, runner);

				return resolve(res);	
			}catch(error){
				reject(error);
			}
		});
	}
}

module.exports = {CodeLandWorker, Ssh};

// Testing area for local file
if (require.main === module){(async function(){try{
	let ssh = new Ssh({
		host:'192.168.1.171',
		user:'virt',
		keyPath:'/home/william/.ssh/id_rsa_cl-worker'
	});


	let clworker = await CodeLandWorker.new({
		ssh: ssh,
		memTarget: 4,
		minAvailableRunners: 2
	})

	// await clworker.ssh.exec('bash ~/clean_crunners.sh');

	// await clworker.deleteUntracedRunners();
	await clworker.runnerFill();
	
	console.log('mem info:', await clworker.memory())

	console.log('runners are full, sleeping');
	await sleep(2000);
	console.log('Wake up!');

	let res = await clworker.runnerRunOnce(`sleep 20`);
	console.log(res)

	// console.log('runners', await clworker.getCurrentCopies())


	// let nextRunner = clworker.runnerPop();

	// console.log('got runner', nextRunner.name);
	// console.log('res', Buffer.from(res.res, 'base64').toString('utf-8'))

	// let count = 0;
	// let failCount = 0;
	// while(1){
	// 	// console.log('mem', await clworker.memory())

	// 	(async function(){		
	// 			res ? count++ : failCount++;
	// 			console.log('worked: ', count, 'failed', failCount, 
	// 				'available runners:', Object.keys(clworker.runners).length,
	// 				'runners in the oven:', clworker.runnersOnBackBunner,
	// 				'free mem percent:', (await clworker.memory()).percent,
	// 			);
	// 	})()
	// 	await sleep(1)
	// }



}catch(error){
	console.error('IIFE error:\n', error);
}})()}
