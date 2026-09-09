'use strict';

const { init } = require('@simpleworkjs/orm');
const { Runner } = require('../models/runner');
const { Token, AuthToken } = require('../models/token');

/*
	Initialize the ORM with this app's models.

	Backends:
	  - Token / AuthToken  -> Sequelize/SQL (conf.database)
	  - Runner (registry)  -> Redis (conf.redis)
*/
const conf = require('../conf');

let models;

async function initOrm(){
	if(models) return models;

	models = await init({
		conf: {
			orm: {
				redis: {
					prefix: conf.redis.prefix,
					redisConf: conf.redis.client || {},
				},
			},
			database: conf.database,
		},
		models: [Runner, Token, AuthToken],
	});

	return models;
}

module.exports = {initOrm};
