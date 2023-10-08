'use strict';

const axios = require('axios');
const { Ssh } = require('./ssh');
const { LXC } = require('./lxc');
const conf = require('../conf')

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}


/**
 * A generator function that manages concurrent execution of promises and yields their results or errors.
 * @param {Function} promiseFactory - A function that returns a promise when called.
 * @param {number} want - The total number of promises to execute.
 * @param {number} delay - The delay (in milliseconds) to wait when reaching the concurrency limit.
 * @param {Array} ...args - Additional arguments to pass to the promiseFactory function.
 * @yields {Array} - Yields an array containing either an error or the result of each promise.
 */
async function* whenReady(promiseFunc, want, delay, ...args) {
  let working = 0;        // Number of promises currently executing.
  let out = [];           // Array to store promise results.
  let errors = [];        // Array to store promise errors.
  let sent = 0;           // Number of promises sent for execution.
  let sentErrors = 0;     // Number of error results sent.

  while (sent < want) {
    // Yield completed promise results.
    while (sent < out.length) {
      yield [null, out[sent++]];
    }

    // Yield error results.
    while (sentErrors < errors.length) {
      yield [errors[sentErrors++], null];
    }

    // Check if we've reached the concurrency limit.
    if (working + out.length + errors.length >= want) {
      if (working + out.length >= want) {
        await sleep(delay);  // Delay if maximum concurrency is reached.
        continue;
      }
    }

    // Start executing a new promise.
    (async function() {
      try {
        working++;
        let res = await promiseFunc(...args);
        out.push(res);   // Store the result if the promise succeeds.
      } catch (error) {
        errors.push(error);  // Store the error if the promise fails.
      } finally {
        working--;
      }
    })();
  }
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
		ovenBackedFailed: (message)=>{
			const error = new Error('ovenBackedFailed');
			error.name = 'ovenBackedFailed';
			error.message = message || '';
			error.status = 500;
			return error;
		},
	}

	__logPrintIgnore = ['cl:worker:memory', 'cl:worker:df']

	__log(topic, message){
		if(message.error && message.error instanceof Error){
			console.error('==========\n', message.error, '\n===========')
		}
		if(this.__logPrintIgnore.includes(topic)) return;
		console.log(topic, ...Object.entries(message).map(([k, v]) => `${k}: ${v},`));
	}

	__runnerSetStatus(runner, status, message){
		if(runner instanceof LXC) runner.lastStatus = status;

		this.__log(`runner:status:${status}`, {
			runner: runner instanceof LXC ? runner.name : runner,
			...(message || {}),
		});
	}

	/*
		In order to guarantee the passed LXC template is valid, we must make
		async calls, so this the the correct method to make new Code land
		instances.
	*/
	async init(){


		this.runnerTemplate = await LXC.get({
			name: this.runnerTemplate,
			execInstance: this.ssh
		});

		let runner = await this.runnerTemplate.info()
		setTimeout(()=> this.__log.call(this, 'init',{
			runnerTemplate: this.runnerTemplate.name,
			memTarget: this.memTarget,
			minAvailableRunners: this.minAvailableRunners,
			location: this.ssh.host,
			user: this.ssh.user,
			userHasKey: !!this.ssh.keyPath,
			startedAt: this.startedAt.getTime(),
			environment: conf.environment,
		}), 1000)
		

		return this;
	}

	constructor(args){
		// Hold the ssh connection to allow remote code execution on the worker.
		this.ssh = args.ssh;

		// Hold the base template for new runners
		this.runnerTemplate = args.runnerTemplate;

		// Set the prefix for cloned runners
		this.runnerPrefix = args.runnerPrefix || `${this.runnerTemplate}-${conf.environment}-`;
		
		// Default memory target for runner creation
		this.memTarget = args.memTarget || 1;

		// How many runners should be created regardless of memory usage
		this.minAvailableRunners = args.minAvailableRunners || 3;

		this.startedAt = new Date();

		// Hold the list of current runners
		this.__runners = {};

		// Keep track how many runners are currently in creation
		this.runnersCooking = 0;

		this.ovenStatus = {
		    "message": "Cooked 1 runners",
		    "cooking": 0,
		    "count": 0,
		}
	}

	get oven(){
		return {
			...this.__oven,
			available: this.runnerCount,
		}
	}

	get runnerCount(){
		return Object.keys(this.__runners).length;
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
				this.__ovenSetStatus('cleaning', `Removing zombie worker ${runner.name}`)
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
	async runnerMake(name){
		name = name || this.runnerPrefix + (Math.random()*100).toString().slice(-5);
		let runner;
		try{
	
			this.__runnerSetStatus(name, 'oven:cooking');
			this.runnersCooking++
			runner = await this.runnerTemplate.copy(name, true);


			let tryCount = 0;

			while(!(await runner.info()).ip){
				if(tryCount++ === 20){ // after 3 seconds, give up
					throw new Error('Timeout waiting on LXC IP');
				}
				await sleep(500);
			}
			this.__runnerSetStatus(runner, 'available',);

			return runner;
		}catch(error){
			this.__runnerSetStatus(runner || name, 'oven:error',{error});
			throw error;
		}finally{
			--this.runnersCooking
		}
	}

	__ovenSetStatus(status, message){
		let data = {
			cooking: this.runnersCooking,
			...(typeof message === 'object' ? message : {message: message}),
			count: this.runnerCount,
		}

		this.ovenStatus = {
			...this.ovenStatus,
			...data,
			status
		};

		this.__log(`oven:status:${status}`, data)
	}

	/*
		Auto populate the array of available runners. The percent of used memory
		or the minimum required runners are used to decide if more need to be
		created. Since runner creation is an async job, the number of in flight
		creations are tracked and limited.

		In order to speed up creation, several runners are created at once. 
	*/
	async runnerOven(selfManagerDelay){
		while(true){
			// Get the current system memory
			let memory = await this.ssh.memory();

			// Test conditions to see of we need more runners
			if(this.runnersCooking > this.minAvailableRunners){
				this.__ovenSetStatus('full', 'To many runners cooking, sleeping')

				await sleep(3000)
				continue;
			}else if(this.minAvailableRunners > Object.keys(this.__runners).length){
				var ovenSize = this.minAvailableRunners - Object.keys(this.__runners).length

				this.__ovenSetStatus('cooking', {
					message: `min runner count not met, oven size ${ovenSize}`,
					cooking: ovenSize,
				})
			}else if(memory.percentUsed < this.memTarget) {
				var ovenSize = Math.floor(this.minAvailableRunners/2);

				this.__ovenSetStatus('cooking', {
					message: 'memory not met',
					cooking: ovenSize,
				})
			}else{
				this.__ovenSetStatus('off', 'Nothing to cook, all conditions met')
				if(!selfManagerDelay) break;
				await sleep(selfManagerDelay*1000)
			}
			try{
				let ovenErrors = 0;
				let newRunners = 0;

				for await(const [error, runner] of whenReady(this.runnerMake.bind(this), ovenSize, 2000)){
					if(error){
						this.__ovenSetStatus('cooking:error', {error})
						if(++ovenErrors === ovenSize) throw new Error('All oven items failed')
					}else{				
						this.__runners[runner.name] = runner;
						newRunners++
					}
				}

				this.__ovenSetStatus('finished', `Cooked ${ovenSize} runners`);

			}catch(error){
				this.__ovenSetStatus('fatal', {error});
			}
			await sleep(3000)
		}
	}

	/*
		Once a runner is not longer needed, clean up any attached timers and
		free its resources. runnerOven is called to make check if a
		replenishment is required 
	*/
	async runnerFree(runner, callOven=true){
		this.__runnerSetStatus(runner, 'free')
		let name = runner instanceof LXC ? runner.name : runner;

		try{
			if(this.__runners[name]){
				delete this.__runners[name];
			}
			if(!(runner instanceof LXC)) throw new Error('runnerNotLXC');

			await runner.destroy();
		}catch(error){
			this.__runnerSetStatus(name, 'free:error', {error})
		}
		this.__runnerSetStatus(name, 'free:success')
		
		console.log('end of oven', this.__runners[name])

		if(callOven) this.runnerOven(false);
	}

	/*
		Get a runner for use.
	*/
	runnerPop(){
		for(let [name, runner] of Object.entries(this.__runners)){
			if(runner.lastStatus == 'available'){
				this.__runnerSetStatus(runner, 'inUse');

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
	async runnerRun(runner, code, time){
		const startTime = new Date();
		try{
			this.__runnerSetStatus(runner, 'execute');

			let res = await axios.post(`http://${this.ssh.host}/`, {
				code: code
			}, {
				headers: {
					Host: runner.name
				},
				timeout: time ? time*1000 : undefined,
			});

			const endTime = new Date();
			const duration = endTime - startTime

			this.__runnerSetStatus(runner, 'complete', {duration});

			return {runner: runner.name, duration, ...res.data};


		}catch(error){
			if(error.code === 'ECONNABORTED'){
				 error = this.errors.runnerTimedOut(time, runner);
			}

			this.__runnerSetStatus(runner, 'error', {error});

			throw error;
		}
	}

	/*
		Execute code on new runner, then kill it.
	*/
	async runnerRunOnce(code, time=60){
		let runner;
		try{
			runner = await this.runnerPop();
			let res = await this.runnerRun(runner, code, time);

			return res;	
		}catch(error){
			throw error;
		}finally{
			if(runner) this.runnerFree(runner);
		}
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
	await clworker.runnerOven();
	
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
	// 				'runners in the oven:', clworker.runnersCooking,
	// 				'free mem percent:', (await clworker.memory()).percent,
	// 			);
	// 	})()
	// 	await sleep(1)
	// }



}catch(error){
	console.error('IIFE error:\n', error);
}})()}
