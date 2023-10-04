'use strict';
const util = require('util');
const exec = util.promisify(require('child_process').exec)

class Exec{
	async exec(command){
		return await exec(command);
	}
}

class Ssh extends Exec{
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

module.exports = {Exec, Ssh};

// Testing area for this file.
if (require.main === module){(async function(){try{

	let ssh = new Ssh({
		host:'192.168.1.171',
		user:'virt',
		keyPath:'/home/william/.ssh/id_rsa_cl-worker'
	});

	console.log(await ssh.exec('hostname; free -h'));

}catch(error){
	console.error('IIFE error:\n', error);
}})()}

