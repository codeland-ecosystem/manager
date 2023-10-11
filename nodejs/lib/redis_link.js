'use strict';

const {setUpTable} = require('/home/william/dev/wmantly/model-redis');
const conf = require('../conf');


const Table = setUpTable(conf.redis);


module.exports = Table;



// Testing area for local file
if (require.main === module){(async function(){try{

	const UUID = function b(a){return a?(a^Math.random()*16>>a/4).toString(16):([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,b)};

	class Token extends Table{
		static _key = 'token'
		static _keyMap = {
			'created_by': {isRequired: true, type: 'string', min: 3, max: 500},
			'created_on': {default: function(){return (new Date).getTime()}},
			'updated_on': {default: function(){return (new Date).getTime()}, always: true},
			'token': {default: UUID, type: 'string', min: 36, max: 36},
			'is_valid': {default: true, type: 'boolean'}
		}

		async check(){
			return this.is_valid
		}
	}

	class AuthToken extends Token{
		static async add(data){
			data.created_by = data.created_by || data.uid;
			return await super.add(data)
		}
	}


	console.log(await AuthToken.listDetail())




}catch(error){
	console.error('IIFE error:\n', error);
}})()}