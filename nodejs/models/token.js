'use strict';

const { Model } = require('@simpleworkjs/orm');

/*
	Auth tokens. Backed by Sequelize/SQL via the @simpleworkjs/orm default
	(sequelize) adapter. The token value is the primary key so lookups by
	token work directly (as the previous redis-backed model did).
*/
class Token extends Model{
	static fields = {
		token: {type: 'uuid', primaryKey: true},
		created_by: {type: 'string', isRequired: true, min: 3, max: 500},
		created_on: {type: 'date', default: function(){return new Date()}},
		updated_on: {type: 'date', default: function(){return new Date()}},
		is_valid: {type: 'boolean', default: true},
	}

	async check(){
		return this.is_valid;
	}
}

/*
	Auth token alias. Kept separate so it maps to its own table and can be
	extended (e.g. invite tokens) without changing auth token behavior.
*/
class AuthToken extends Token{
	static tableName = 'auth_tokens';
}

module.exports = {Token, AuthToken};
