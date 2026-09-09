'use strict';

const { init } = require('@simpleworkjs/orm');
const { Runner } = require('../models/runner');

/*
	Initialize the ORM with this app's models. The Runner registry uses the
	Redis adapter (model-redis), keyed off conf.redis.
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
		},
		models: [Runner],
	});

	return models;
}

module.exports = {initOrm};
