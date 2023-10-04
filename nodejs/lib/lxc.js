'use strict';

const {Exec, Ssh} = require('./ssh');

class LXC{
	static execInstance = new Exec();
	
	static setExec(sysExec){
		if(sysExec instanceof Exec){
			this.execInstance = sysExec;
			return true;
		}

		throw new Error(`${sysExec} is not an instanceof Exec`);
	}

	static async sysExec(command){
		return await this.execInstance.exec.call(this.execInstance, command);
	}

	static async list(sysExec){
		try{
			sysExec = sysExec || this.sysExec
			let res = await this.sysExec(`lxc-ls --fancy`);
			if(!res.stdout) return [];
			res = res.stdout.split("\n").slice(0).slice(0,-1);
			let keys = res.splice(0,1)[0].split(/\s+/).slice(0,-1).map(function(v){return v.toLowerCase()});
			let info = [];

			for(let line of res){
				if(line.match(/^-/)) continue;

				line = line.split(/\s+/).slice(0,-1);

				let mapOut = {};
				line.map(function(value,idx){
					mapOut[keys[idx]] = value;
				});

				mapOut.is_running = !!(mapOut.state === 'RUNNING');

				info.push(mapOut);
			}

			return info;

		}catch(error){
			throw error;
		}
	}

	static async get(args){
		let instance = new this(args);
		await instance.info();

		return instance;
	}

	constructor(args){
		// console.log('lxc args', args)
		this.name = args.name
		this.execInstance = args.execInstance || this.constructor.execInstance;
	}

	async sysExec(command){
		return this.constructor.sysExec.call(this, command)
	}

	async list(){
		return this.constructor.list.call(this)
	}

	async copy(newName, ephemeral=false){
		try{
			let res = await this.sysExec(
				`lxc-copy --name "${this.name}" --newname "${newName}" --daemon ${ephemeral ? '--ephemeral' : ''}`
			);

			return new LXC({
				name: newName,
				execInstance: this.execInstance,
			});

		}catch(error){
			if(error.code === 1){
				throw new Error(`LXC Copy Failed`);
			}else{
				throw error;
			}
		}
	}

	async start(){
		try{	
			return await this.sysExec(`lxc-start --name "${this.name}" --daemon`);
		}catch(error){
			throw error;
		}
	}

	async destroy(){
		try{
			let res = await this.sysExec(`lxc-destroy --force --name ${this.name}`)

			return !!res.stdout.match(/Destroyed container/);
		}catch(error){
			throw error;
		}
	}

	async stop(){
		try{			
			return await this.sysExec(`lxc-stop --name "${this.name}"`);
		}catch(error){
			throw error;
		}
	}

	async exec(code){
		try{
			code = new Buffer.from(code).toString('base64')
			return await this.sysExec(`lxc-attach -n "${this.name}" --clear-env -- bash -c 'echo "${code}" | base64 --decode | bash'`)
		}catch(error){
			throw error;
		}
	}

	async info(){
		try{
			let info = {};
			
			let res = await this.sysExec(`lxc-info --name "${this.name}"`)
			res = res.stdout;

			res = res.replace(/\suse/ig, '').replace(/\sbytes/ig, '').split("\n").slice(0,-1);
			for(var i in res){
				var temp = res[i].split(/\:\s+/);
				info[temp[0].toLowerCase().trim()] = temp[1].trim();
			}
			var args = [info].concat(Array.prototype.slice.call(arguments, 1));
			
			return info;

		}catch(error){
			if((error.stderr || '').match("doesn't exist")){
				throw new Error('ContainerDoesntExist')
			}
			throw error;
		}
	}

	async setAutoStart(name){
		await this.sysExec(`echo "lxc.start.auto = 1" >>  "$HOME/.local/share/lxc/${this.name}/config"`)
	}
}

module.exports = {Exec, Ssh, LXC};


// Testing area for local file
if (require.main === module){(async function(){try{


	let ssh = new Ssh({
		host:'192.168.1.171',
		user:'virt',
		keyPath:'/home/william/.ssh/id_rsa_cl-worker'
	});


	LXC.setExec(ssh);
	// console.log(await LXC.list())
	let crunnerTeplate = await LXC.get({name: 'crunner0'});
	console.log(await crunnerTeplate.info())


	// // let runner1 = new LXC({name: 'crunner-3252'});
	// // let runner1 = await crunnerTeplate.copy('crunner-3252', true);
	// // console.log(await runner1.info())
	

	// console.log(await runner1.list())
// 


}catch(error){
	console.error('IIFE error:\n', error);
}})()}
