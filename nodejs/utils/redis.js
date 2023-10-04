'use strict';

const {createClient} = require('redis');
const {promisify} = require('util');

const config = {
	prefix: 'deploy_'
}

function client() {
	return createClient(config);
}

const _client = client();

const SCAN = promisify(_client.SCAN).bind(_client);


module.exports = {
	client: client,
	HGET: promisify(_client.HGET).bind(_client),
	HDEL: promisify(_client.HDEL).bind(_client),
	SADD: promisify(_client.SADD).bind(_client),
	SREM: promisify(_client.SREM).bind(_client),
	DEL: promisify(_client.DEL).bind(_client),
	HSET: promisify(_client.HSET).bind(_client),
	HGETALL: promisify(_client.HGETALL).bind(_client),
	SMEMBERS: promisify(_client.SMEMBERS).bind(_client),
	RENAME: promisify(_client.RENAME).bind(_client),
	HSCAN: promisify(_client.HSCAN).bind(_client),
	SCAN: async function(match){
		let coursor = 0;
		let results = [];
		do{
			let res = await SCAN(coursor, 'MATCH', config.prefix+match);
			coursor = Number(res[0]);

			results.push(...res[1].map(e => e.replace(config.prefix, '')))
		} while(coursor);

		return results
	}

};
