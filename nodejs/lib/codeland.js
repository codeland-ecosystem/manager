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
		console.log(topic, ...Object.entries(message).map(([k, v]) => `${k}: ${v},`));
		if(message.error && message.error instanceof Error){
			console.error('==========\n', message.error, '\n===========')
		}
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

		this.__log.call(this, 'init',{
			runnerTemplate: this.runnerTemplate.name,
			memTarget: this.memTarget,
			minAvailableRunners: this.minAvailableRunners,
		});

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

		// Hold the list of current runners
		this.__runners = {};

		// Keep track how many runners are currently in creation
		this.__runnersCooking = 0;
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

		this.runnerSetStatus(name, 'cooking',{
			runnersCooking: ++this.__runnersCooking,
		})


		let runner = await this.runnerTemplate.copy(name, true);
		while(!(await runner.info()).ip) await sleep(250);
		
		this.runnerSetStatus(runner, 'available', {
			runnersCooking: --this.__runnersCooking
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
			let memory = await this.ssh.memory();
			let message = {
					runnersCooking: this.__runnersCooking,
					AvailableRunners: Object.keys(this.__runners).length,
			}
			if(this.__runnersCooking > this.minAvailableRunners){
				this.__log('runner:fill:pause', {
					...message,
					message: `stopping to many in the oven`
				});
				await sleep(1000)
				continue;
			}else if(this.minAvailableRunners > Object.keys(this.__runners).length){

				this.__log('runner:fill:cooking', {
					...message,
					message: 'Not enough runners, forcing to make more'
				});
			}else if(memory.percentUsed < this.memTarget) {
				this.__log('runner:fill:cooking', {
					...message,
					message: 'Not at memory target'
				});
			}else{
				this.__log('runner:fill:success', {
					...message,
					message: 'Runners are full!',
					availableRunners: Object.keys(this.__runners).length,
				});
				break;
			}

			try{
				let toCook = this.minAvailableRunners/2;
				this.__log('runner:fill:cooking', {
					runnersCooking: toCook
				});
				const createRunnersAsync = async (count) => Promise.all(Array.from({ length: count }, () => this.runnerMake()));	
				let runners = await createRunnersAsync(this.minAvailableRunners/2);


				for(let runner of runners){
					this.__runners[runner.name] = runner;
				}

			}catch(error){
				this.__log('runner:fill:error', {
					...message,
					message: `error count ${errorCount}`,
					error: error
				});

				continue;
			}
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
		this.runnerSetStatus(runner, 'stopped');


		if(this.__runners[runner.name]){
			delete this.__runners[name];
		}

		if(runner.hasOwnProperty('timeout')){
			clearTimeout(runner.timeout);
		}

		try{
			await runner.destroy();
		}catch(error){
			if(error.name === 'LXCNotFound'){
				this.__log('runner:free:error:error:LXCNotFound', {
					error: 'runner:free:error:',
					message: 'Ignoring for now..  will call cleanup script to delete container',
					runner: runner.name,
				});
			}else{
				throw error;
			}
		}
		if(fill) this.runnerFill();
		this.__log('runner:free:success', {
			message: `done`,
			runner: name
		});
	}

	runnerSetStatus(runner, status, message){
		if(runner instanceof LXC) runner.lastStatus = status;
		this.__log(`runner:status:${status}`, {
			runner: runner instanceof LXC ? runner.name : runner,
			...(message || {}),
			cooking: this.__runnersCooking,
			available: Object.keys(this.__runners).length,
		})
	}

	/*
		Get a runner for use.
	*/
	runnerPop(){
		for(let [name, runner] of Object.entries(this.__runners)){
			if(runner.lastStatus == 'available'){
				this.runnerSetStatus(runner, 'inUse');

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
		console.log('runnerRun', time)
		const startTime = new Date();
		try{
			this.runnerSetStatus(runner, 'execute');

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

			this.runnerSetStatus(runner, 'complete', {duration});

			return {runner: runner.name, duration, ...res.data};


		}catch(error){
			if(error.code === 'ECONNABORTED'){
				 error = this.errors.runnerTimedOut(time, runner);
			}

			this.runnerSetStatus(runner, 'error', {error});

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
	// 				'runners in the oven:', clworker.runnersCooking,
	// 				'free mem percent:', (await clworker.memory()).percent,
	// 			);
	// 	})()
	// 	await sleep(1)
	// }



}catch(error){
	console.error('IIFE error:\n', error);
}})()}
