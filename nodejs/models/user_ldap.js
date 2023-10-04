'use strict';

const {Client, Attribute} = require('ldapts');
const conf = require('../app').conf.ldap;

const client = new Client({
  url: conf.url,
});

const user_parse = function(data){
	if(data[conf.userNameAttribute]){
		data.username = data[conf.userNameAttribute]
		data.userPassword = undefined;
	}

	return data;
}

var User = {}

User.backing = "LDAP";

User.list = async function(){
	try{
		await client.bind(conf.bindDN, conf.bindPassword);

		const res = await client.search(conf.userBase, {
		  scope: 'sub',
		  filter: conf.userFilter,
		  attributes: ['*', 'createTimestamp', 'modifyTimestamp'],
		});

		await client.unbind();

		return res.searchEntries.map(function(user){return user.uid});
	}catch(error){
		throw error;
	}
};

User.listDetail = async function(){
	try{
		await client.bind(conf.bindDN, conf.bindPassword);

		const res = await client.search(conf.userBase, {
		  scope: 'sub',
		  filter: conf.userFilter,
		  attributes: ['*', 'createTimestamp', 'modifyTimestamp'],
		});

		await client.unbind();

		let users = []

		for(let user of res.searchEntries){
			let obj = Object.create(this);
			Object.assign(obj, user_parse(user));
			
			users.push(obj)

		}

		return users;

	}catch(error){
		throw error;
	}
};

User.get = async function(data, key){
	try{
		if(typeof data !== 'object'){
			let uid = data;
			data = {};
			data.uid = uid;
		}


		await client.bind(conf.bindDN, conf.bindPassword);

		data.searchKey = data.searchKey || key || conf.userNameAttribute;
		data.searchValue = data.searchValue || data.uid;

		let filter = `(&${conf.userFilter}(${data.searchKey}=${data.searchValue}))`;

		const res = await client.search(conf.userBase, {
			scope: 'sub',
			filter: filter,
			attributes: ['*', 'createTimestamp', 'modifyTimestamp'],
		});

		await client.unbind();

		let user = res.searchEntries[0]

		if(user){
			let obj = Object.create(this);
			Object.assign(obj, user_parse(user));
			
			return obj;
		}else{
			let error = new Error('UserNotFound');
			error.name = 'UserNotFound';
			error.message = `LDAP:${data.searchValue} does not exists`;
			error.status = 404;
			throw error;
		}
	}catch(error){
		throw error;
	}
};

User.exists = async function(data, key){
	// Return true or false if the requested entry exists ignoring error's.
	try{
		await this.get(data, key);

		return true
	}catch(error){
		return false;
	}
};

User.login = async function(data){
	try{
		
		let user = await this.get(data.uid);
		
		await client.bind(user.dn, data.password);

		await client.unbind();

		return user;

	}catch(error){
		throw error;
	}
};


module.exports = {User};


// (async function(){
// try{
// 	console.log(await User.list());

// 	console.log(await User.listDetail());

// 	console.log(await User.get('wmantly'))

// }catch(error){
// 	console.error(error)
// }
// })()