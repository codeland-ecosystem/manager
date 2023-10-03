'use strict';

module.exports = {
	userModel: 'ldap', // pam, redis, ldap
	ldap: {
		url: 'ldap://192.168.1.55:389',
		bindDN: 'cn=ldapclient service,ou=people,dc=theta42,dc=com',
		bindPassword: '__IN SRECREST FILE__',
		userBase: 'ou=people,dc=theta42,dc=com',
		groupBase: 'ou=groups,dc=theta42,dc=com',		
		userFilter: '(objectClass=posixAccount)',
		userNameAttribute: 'uid'
	},
	httpProxyAPI:{
		host: 'http://10.1.0.51:3000',
		key: '__IN SRECREST FILE__'
	}
};
