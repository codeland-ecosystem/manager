'use strict';
const util = require('util');
const exec = util.promisify(require('child_process').exec)

class Local{
	async exec(command){
		try{
		return await exec(command);

		}catch(error){
			throw error
		}
	}

	async memory(){
		let res = (await this.exec("head /proc/meminfo")).stdout;
		let memory = {};
		let byteMultiplier = {'': 0, kb: 1024, mb:1000000};

		for(let line of res.split('\n')){
			if(!line) continue;
			line = line.split(/[: \t]+/)
			line[0] = line[0].replace(/^Mem/, '')
			let key = line[0].charAt(0).toLowerCase() + line[0].slice(1);

			memory[key] = Number(line[1])*byteMultiplier[line[2].toLowerCase()]
		}

		memory.used = memory.total - memory.available;
		memory.percentUsed =(memory.used/memory.total)*100;
		memory.percentFree =((memory.free)/memory.total)*100;
		memory.percentAvailable =((memory.available)/memory.total)*100;

		console.lo

		return memory;
	}

	async df(){
		try{
			let res = (await this.exec('df')).stdout;

			let info = {};
			let keys;
			for(let line of res.split('\n')){
				if(!line) continue;
				line = line.split(/[\s\t]+/);
				if(!keys){
					keys = line;
					continue;
				}

				let mapOut = {};
				line.map(function(value,idx){
					mapOut[keys[idx].toLowerCase()] = value;
				});

				mapOut['available'] = Number(mapOut['available'])*1000;
				mapOut['used'] = Number(mapOut['used'])*1000;
				mapOut['total'] = mapOut['available']+ mapOut['used'];
				mapOut['use%'] = Number.parseInt(mapOut['use%']);

				info[mapOut[`mounted`]] = mapOut;
			}

			return info;

		}catch(error){
			throw error;
		}
	}
}

class Ssh extends Local{
	constructor(args){
		super()
		this.user = args.user;
		this.host = args.host;
		this.keyPath = args.keyPath;
	}

	async exec(command){
		command = new Buffer.from(command).toString('base64');
		command = `ssh -i "${this.keyPath}" -o StrictHostKeyChecking=no ${this.user}@${this.host} "echo ${command} | base64 --decode | bash"`;
		
		return await super.exec(command);
	}
}

module.exports = {Local, Ssh};

// Testing area for this file.
if (require.main === module){(async function(){try{

	let ssh = new Ssh({
		host:'192.168.1.171',
		user:'virt',
		keyPath:'/home/william/.ssh/id_rsa_cl-worker'
	});

	// console.log(await ssh.exec('hostname; free -h'));

	// let local = new Local();

	console.log(await local.df())
	// console.log(await local.memory())

}catch(error){
	console.error('IIFE error:\n', error);
}})()}




