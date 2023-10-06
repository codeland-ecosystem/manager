'use strict';

module.exports = {
	userModel: 'ldap', // pam, redis, ldap
	ldap: {
		url: 'ldap://10.1.0.55:389',
		bindDN: 'cn=ldapclient service,ou=people,dc=theta42,dc=com',
		bindPassword: '__IN SRECREST FILE__',
		userBase: 'ou=people,dc=theta42,dc=com',
		groupBase: 'ou=groups,dc=theta42,dc=com',		
		userFilter: '(objectClass=posixAccount)',
		userNameAttribute: 'uid'
	},
	httpProxyAPI:{
		host: 'http://10.2.0.51:3000',
		key: '__IN SRECREST FILE__'
	},
	ssh:{
		host:'192.168.1.171',
		user:'virt',
		keyPath:'~/.ssh/id_rsa_cl-worker',
	},
	clworker: {
		runnerTemplate: 'crunner0',
		memTarget: 1,
		minAvailableRunners: 10,
	},
};
