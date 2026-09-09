'use strict';

const {User} = require('./user');
const {initOrm} = require('../lib/orm');

var Auth = {}
Auth.errors = {}

Auth.errors.login = function(){
	let error = new Error('LDAPLoginFailed');
	error.name = 'LDAPLoginFailed';
	error.message = `Invalid Credentials, login failed.`;
	error.status = 401;

	return error;
}

Auth.login = async function(data){
	try{
		let user = await User.login(data);
		const {AuthToken} = await initOrm();
		let token = await AuthToken.create({created_by: user.uid || user.dn});

		return {user, token}
	}catch(error){
		console.log('login error', error);
		throw this.errors.login();
	}
};


Auth.checkToken = async function(data){
	try{
		const {AuthToken} = await initOrm();
		let token = await AuthToken.get(data.token);
		if(!token) throw this.errors.login();
		if(token.is_valid){
			return await User.get(token.created_by);
		}
		throw this.errors.login();
	}catch(error){
		console.log('token error', data)
		throw this.errors.login();
	}
};

Auth.logOut = async function(data){
	try{
		const {AuthToken} = await initOrm();
		let token = await AuthToken.get(data.token);
		await token.delete();
	}catch(error){
		throw error;
	}
}

module.exports = {Auth, AuthToken: require('../models/token').AuthToken};
