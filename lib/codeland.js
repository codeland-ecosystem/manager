'use strict';

const axios = require('axios');
const { Ssh } = require('./ssh');
const { LXC } = require('./lxc');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class CodeLandWorker{
	static async new(args){
		let instance = new this();
		instance.ssh = args.ssh;
		instance.runnerTamplate = args.crunnerTeplate || 'crunner0';
		instance.memTarget = args.memTarget || 50;
		instance.minAvailableRunners = args.minAvailableRunners || 3;

		instance.runners = {};
		instance.runnerFillLock = false;
		instance.runnersOnBackBunner = 0;

		instance.lxcTemplate = await LXC.get({
			name: instance.runnerTamplate,
			execInstance: instance.ssh
		});

		await instance.lxcTemplate.info()

		return instance;
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
			if(container.name.startsWith('crunner-')){
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
		let name = 'crunner-'+(Math.random()*100).toString().slice(-5);
		this.runnersOnBackBunner++;
		let runner = await this.lxcTemplate.copy(name, true);
		while(!(await runner.info()).ip) await sleep(250);

		this.runnersOnBackBunner--;
		return runner;
	}

	async runnerFill(){
		console.log('runnerFillLock', this.runnerFillLock);
		// if(this.runnerFillLock) return;

		this.runnerFillLock = true;

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
				console.error('runnerFill error, count', ++errorCount, error)
				await sleep(100);
				continue;
			}

			await sleep(250);
		}
		this.runnerFillLock = false;
	}

	async runnerFree(runner){
		console.log('runnerFree')
		if(!(runner instanceof LXC)){
			console.log('runnerFree called on bad runner?', runner)
			if(this.runners[name]) delete this.runners[name];
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
		let res = await axios.post(`http://${this.ssh.host}/`, {
		    code: code
		  }, {
		    headers: {
		      'Host': runner.name
		    }
		});

		return res;
	}

	runnerPop(){
		for(let [name, runner] of Object.entries(this.runners)){
			if(!runner.inUse){
				runner.inUse = true;
				return runner
			}
		}
	}

	async runnerRunOnce(code, time=60, retyCount=0, runner=null){
		console.log('runnerRunOnce', retyCount, runner ? runner.name: '');
		if(retyCount > 3 ){
				if(!runner){
					console.log('runnerRunOnce no runners now');
					this.runnerFree.call(this, runner);
				}else{
				}
			return false
		}

		if(!runner){
			runner = await this.runnerPop();
			if(!runner){
				console.log('runnerRunOnce runner pop failed!');
				await sleep(1000);
				return await this.runnerRunOnce(code, time, ++retyCount, runner);
			}
			runner.timeout = setTimeout(this.runnerFree.bind(this), time*100, runner)
		}

		if(!runner) return false;
		let res;
		try{
			res = await this.runnerRun(runner, code);
		}catch(error){
			console.log('runnerRunOnce failed, retry', retyCount, 'on', runner.name)
			await sleep(500);
			return await this.runnerRunOnce(code, time, ++retyCount, runner);
		}

		(async ()=>{
			try{
				console.log('runnerRunOnce done, calling free for', runner.name)
				await this.runnerFree.call(this, runner);
			}catch(error){
				console.log('runnerRunOnce IIFE error');
			}
		})();

		return res.data;
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
		memTarget: 40,
		minAvailableRunners: 10
	})

	// await clworker.ssh.exec('bash ~/clean_crunners.sh');

	await clworker.deleteUntracedRunners();
	
	console.log('mem info:', await clworker.memory())

	await clworker.runnerFill();
	console.log('runners are full, sleeping');
	await sleep(2000);
	console.log('Wake up!');


	// console.log('runners', await clworker.getCurrentCopies())


	// let nextRunner = clworker.runnerPop();

	// console.log('got runner', nextRunner.name);
	// console.log('res', Buffer.from(res.res, 'base64').toString('utf-8'))

	let count = 0;
	let failCount = 0;
	while(1){
		// console.log('mem', await clworker.memory())

		(async function(){		
			let res = await clworker.runnerRunOnce(`speed ${Math.floor(Math.random() * 60) + 1}`);
				res ? count++ : failCount++;
				console.log('worked: ', count, 'failed', failCount, 
					'available runners:', Object.keys(clworker.runners).length,
					'runners in the oven:', clworker.runnersOnBackBunner,
					'free mem percent:', (await clworker.memory()).percent,
				);
		})()
		await sleep(Math.floor(Math.random() * (100000 - 5000 + 1)) + 500)
	}



}catch(error){
	console.error('IIFE error:\n', error);
}})()}
