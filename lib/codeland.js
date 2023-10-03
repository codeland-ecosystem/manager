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

class CodeLandWorker{
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

	static async new(args){
		let instance = new this(args);
		instance.lxcTemplate = await LXC.get({
			name: instance.runnerTamplate,
			execInstance: instance.ssh
		});

		await instance.lxcTemplate.info()

		return instance;
	}

	constructor(args){
		this.ssh = args.ssh;
		this.runnerTamplate = args.lxcTemplate;
		this.runnerPrefix = args.runnerPrefix || `${this.runnerTamplate}-${conf.environment}-`;
		this.memTarget = args.memTarget || 50;
		this.minAvailableRunners = args.minAvailableRunners || 3;

		this.runners = {};
		this.runnersOnBackBunner = 0;
	}

	async memory(){
		let res = await this.ssh.exec(
			"head /proc/meminfo|grep MemFree|grep -Po '\\d+'; head /proc/meminfo|grep MemTotal|grep -Po '\\d+'",
		);

		let available = Number(res.stdout.split('\n')[0]);
		let total = Number(res.stdout.split('\n')[1]);
		let used = total - available;
		let percent = (used/total)*100;

		return {
			total,
			available,
			used,
			percent,
		}
	}

	async getCurrentCopies(){
		let containers = await this.lxcTemplate.list();
		let runners = {};
		for(let container of containers){
			if(container.name.startsWith(this.runnerPrefix ) ){
				if(container.name === this.runnerTamplate) continue;
				runners[container.name] = await this.lxcTemplate.constructor.get({
					name: container.name,
					execInstance: this.ssh,
				});
			}
		}

		return runners;
	}

	async deleteUntracedRunners(){
		for(let [name, runner] of Object.entries(await this.getCurrentCopies())){
			if(!this.runners[name]){
				console.log('deleting', name)
				await runner.destroy();
			}
		}
	}

	async runnerMake(){
		let name = this.runnerPrefix + (Math.random()*100).toString().slice(-5);
		this.runnersOnBackBunner++;
		let runner = await this.lxcTemplate.copy(name, true);
		while(!(await runner.info()).ip) await sleep(250);

		this.runnersOnBackBunner--;
		return runner;
	}

	async runnerFill(){
		let errorCount = 0;
		while(true){
			let memory = await this.memory()
			if(this.runnersOnBackBunner > this.minAvailableRunners){
				console.log('runnerFill, stopping to many in the oven', this.runnersOnBackBunner)
				break;
			}else if(this.minAvailableRunners > Object.keys(this.runners).length){
				console.log('runnerFill Not enough runners, forcing to make more', this.minAvailableRunners, Object.keys(this.runners).length)
			}else if(memory.percent > this.memTarget) {
				console.log('runnerFill stopping above memory percent', memory.percent)
				break
			}

			try{
				const createRunnersAsync = (count) => Promise.all(Array.from({ length: count }, () => this.runnerMake()));
				let runners = await createRunnersAsync(this.minAvailableRunners/2);

				for(let runner of runners){
					this.runners[runner.name] = runner;
					console.log(`created ${runner.name} runner for fill, count now ${Object.keys(this.runners).length}`);

				}
			}catch(error){
				console.error('runnerFill error, count', ++errorCount, error);
				continue;
			}
			await sleep(250);
		}
	}

	async runnerFree(runner){
		console.log('runnerFree', runner ? runner.name : '')
		if(!(runner instanceof LXC)){
			console.log('runnerFree called on bad runner?', runner)
			if(this.runners[runner]) delete this.runners[runner];
			return false;
		}

		if(!this.runners[runner.name]){
			console.log('runnerFree runner not found', runner.name)
			runner.destroy;
			return false;
		}

		let name = runner.name;
		if(runner.hasOwnProperty('timeout')){
			clearTimeout(runner.timeout);
		}
		delete this.runners[name];
		await runner.destroy();
		this.runnerFill()
	}

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

	runnerPop(){
		for(let [name, runner] of Object.entries(this.runners)){
			if(!runner.inUse){
				runner.inUse = true;
				return runner
			}
		}

		throw this.errors.runnerNotAvailable();
	}

	runnerGetByName(name){
		let runner = this.runners[name];
		if(runner) return runner;
		throw this.errors.runnerNotFound(name);
	}

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
