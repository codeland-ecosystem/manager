'use strict';

const { Client, Attribute, Change } = require('ldapts');
const conf = require('../app/conf').ldap;

const client = new Client({
	url: conf.url,
});

async function getGroups(client, member){
	try{

		let memberFilter = member ? `(member=${member})`: ''

		let groups = (await client.search(conf.groupBase, {
			scope: 'sub',
			filter: `(&(objectClass=groupOfNames)${memberFilter})`,
			attributes: ['*', 'createTimestamp', 'modifyTimestamp'],
		})).searchEntries;

		return groups.map(function(group){
			if(!Array.isArray(group.member)) group.member = [group.member];
			return group
		});
	}catch(error){
		throw error;
	}
}

var Group = {};

Group.list = async function(member){
	try{
		await client.bind(conf.bindDN, conf.bindPassword);

		let groups = await getGroups(client, member)

		await client.unbind();

		return groups.map(group => group.cn);
	}catch(error){
		throw error;
	}
}

Group.listDetail = async function(member){
	try{
		await client.bind(conf.bindDN, conf.bindPassword);

		let groups = await getGroups(client, member)

		await client.unbind();


		return groups;
	}catch(error){
		throw error;
	}
}

Group.get = async function(data){
	try{

		if(typeof data !== 'object'){
			let name = data;
			data = {};
			data.name = name;
		}
		
		await client.bind(conf.bindDN, conf.bindPassword);

		let group = (await client.search(conf.groupBase, {
			scope: 'sub',
			filter: `(&(objectClass=groupOfNames)(cn=${data.name}))`,
			attributes: ['*', 'createTimestamp', 'modifyTimestamp'],
		})).searchEntries[0];

		await client.unbind();

		if(!Array.isArray(group.member)) group.member = [group.member];

		if(group){
			let obj = Object.create(this);
			Object.assign(obj, group);
			
			return obj;
		}else{
			let error = new Error('GroupNotFound');
			error.name = 'GroupNotFound';
			error.message = `LDAP:${data.cn} does not exists`;
			error.status = 404;
			throw error;
		}
	}catch(error){
		throw error;
	}
}

module.exports = {Group};
