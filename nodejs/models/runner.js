'use strict';

const Table = require('../lib/redis_model');

/*
	Registry entry for a persistent runner. Maps a runner name to the worker
	host currently hosting it, so requests can be routed to the right worker
	and runners can be migrated between workers.
*/
class Runner extends Table{
	static _key = 'name'
	static _keyMap = {
		'name': {isRequired: true, type: 'string', min: 1, max: 200},
		'worker': {isRequired: true, type: 'string', min: 1, max: 200},
		'type': {default: 'persistent', type: 'string'},
		'status': {default: 'stopped', type: 'string'},
		'created_on': {default: function(){return (new Date).getTime()}},
		'updated_on': {default: function(){return (new Date).getTime()}, always: true},
	}
}

module.exports = {Runner};
