'use strict';

const { Model } = require('@simpleworkjs/orm');

/*
	Registry entry for a persistent runner. Maps a runner name to the worker
	host currently hosting it, so requests can be routed to the right worker
	and runners can be migrated between workers.

	Backed by Redis (model-redis) via the @simpleworkjs/orm redis adapter.
*/
class Runner extends Model{
	static adapterName = 'redis';
	static fields = {
		name: {type: 'string', primaryKey: true, isRequired: true, max: 200},
		worker: {type: 'string', isRequired: true, max: 200},
		type: {type: 'string', default: 'persistent'},
		status: {type: 'string', default: 'stopped'},
		created_on: {type: 'int', default: function(){return (new Date).getTime()}},
		updated_on: {type: 'int', default: function(){return (new Date).getTime()}},
	};
}

module.exports = {Runner};
