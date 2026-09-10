'use strict';

const {Local, Ssh} = require('./ssh');


class LXC{
	static execInstance = new Local();
	
	static setExec(sysExec){
		if(sysExec instanceof Local){
			this.execInstance = sysExec;
			return true;
		}

		throw new Error(`${sysExec} is not an instanceof Local`);
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
		this.ephemeralHack = args.ephemeralHack
		this.persistent = args.persistent
		this.base = args.base
		this.memLimit = args.memLimit
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
				`~/.local/bin/lxc-copy --name "${this.name}" --newname "${newName}" --daemon ${ephemeral ? '--ephemeral' : ''}`
			);

			return new LXC({
				name: newName,
				execInstance: this.execInstance,
				base: this
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
			return await this.sysExec(`~/.local/bin/lxc-start --name "${this.name}" --daemon`);
		}catch(error){
			throw error;
		}
	}

	errors = {
		LXCNotFound: (name)=>{
			const error = new Error('LXCNotFound');
			error.name = 'LXCNotFound';
			error.message = `The requested LXC, ${name} can not be found`;
			error.status = 404;
			return error;
		},
	}


	async destroy(){
		try{

			// if(this.ephemeralHack) return await this.destroyEphemeral();

			let res = await this.sysExec(`lxc-destroy --force --name ${this.name} logpriority=debug`)
			return true;
		}catch(error){
			if(error.stderr.includes('Container is not defined')) throw this.errors.LXCNotFound(this.name)
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
			return await this.sysExec(`~/.local/bin/lxc-attach -n "${this.name}" --clear-env -- bash -c 'echo "${code}" | base64 --decode | bash'`)
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

	async startEphemeral(newName){
		try{
			let memLimit = this.memLimit ? this.constructor.parseMemLimit(this.memLimit) : '';
			// lxc-start-ephemeral is a python script; the manager's sysExec
			// runs commands via bash, so invoke it explicitly with python3.
			let res = await this.sysExec(
				`python3 ~/.local/bin/lxc-start-ephemeral "${this.name}" "${newName}" "${memLimit}"`
			);

			return new LXC({
				name: newName,
				execInstance: this.execInstance,
				base: this,
				ephemeralHack: true,
				memLimit: this.memLimit,
			});

		}catch(error){
			throw error
		}
	}

	/*
		Start a persistent runner. The writable layer lives on shared NFS so
		the runner can move between workers. If the runner already exists on
		this worker (e.g. after a move), it is started in place.
	*/
	async startPersistent(newName){
		try{
			let memLimit = this.memLimit ? this.constructor.parseMemLimit(this.memLimit) : '';
			let res = await this.sysExec(
				`python3 ~/.local/bin/lxc-start-persistent "${newName}" "${this.name}" "${memLimit}"`
			);

			return new LXC({
				name: newName,
				execInstance: this.execInstance,
				base: this,
				persistent: true,
				memLimit: this.memLimit,
			});

		}catch(error){
			throw error
		}
	}

	/*
		Stop a persistent runner, keeping its NFS state so it can be restarted
		or moved to another worker.
	*/
	async stopPersistent(){
		try{
			await this.sysExec(
				`~/.local/bin/lxc-stop-persistent "${this.name}"`
			);
			return true;
		}catch(error){
			throw error;
		}
	}

	/*
		Set a cgroup v2 memory limit on a running container. Accepts a number
		of bytes or a human readable string like "512M" or "1G". Writes
		directly to the live cgroup so it takes effect without a restart.
	*/
	async setMemLimit(limit){
		try{
			let bytes = this.constructor.parseMemLimit(limit);
			if(!bytes) return;

			await this.sysExec(
				`echo ${bytes} | sudo tee /sys/fs/cgroup/lxc/${this.name}/memory.max > /dev/null`
			);

			return true;
		}catch(error){
			throw error;
		}
	}

	static parseMemLimit(limit){
		if(typeof limit === 'number') return limit;

		if(typeof limit === 'string'){
			let match = limit.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?i?b?)$/i);
			if(!match) return null;

			let value = Number(match[1]);
			let unit = match[2].toLowerCase();
			let multiplier = {b: 1, kb: 1024, mb: 1024**2, gb: 1024**3, tb: 1024**4}[unit];
			if(multiplier === undefined){
				multiplier = {k: 1024, m: 1024**2, g: 1024**3, t: 1024**4}[unit] || 1;
			}

			return Math.floor(value * multiplier);
		}

		return null;
	}

	async destroyEphemeral(name){
		try{
			// Prefer the explicit name argument. When called on the template
			// (this.name === base) to clean up a failed runner, we must NOT
			// fall back to this.name or we'd destroy the base container.
			name = name || this.name
			let res = await this.sysExec(
				`~/.local/bin/lxc-destroy-ephemeral "${name}"`
			);

			return true;
		}catch(error){
			throw error;
		}
	}

	async setAutoStart(name){
		await this.sysExec(`echo "lxc.start.auto = 1" >>  "$HOME/.local/share/lxc/${this.name}/config"`)
	}

	// toJSON(){
	// 	return {
	// 		name: this.name

	// 	}
	// }
}

module.exports = {Local, Ssh, LXC};


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

}catch(error){
	console.error('IIFE error:\n', error);
}})()}
