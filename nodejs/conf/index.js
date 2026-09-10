'use strict';

const extend = require('extend');

const environment = process.env.NODE_ENV || 'development';

function load(filePath, required){
	try {
		return require(filePath);
	} catch(error){
		if(error.name === 'SyntaxError'){
			console.error(`Loading ${filePath} file failed!\n`, error);
			process.exit(1);
		} else if (error.code === 'MODULE_NOT_FOUND'){
			console.warn(`No config file ${filePath} FOUND! This may cause issues...`);
			if (required){
				process.exit(1);
			}
			return {};
		}else{
			console.dir(`Unknown error in loading ${filePath} config file.\n`, error);
		}
	}
};

const conf = extend(
	true, // enable deep copy
	load('./base', true),
	load(`./${environment}`),
	load('./secrets'),
	{environment}
);

// Additional worker hosts can be added via env instead of a committed config
// file edit: CODELAND_WORKERS is a comma-separated host list, merged with
// (not replacing) conf.workers from the config files.
if(process.env.CODELAND_WORKERS){
	const envWorkers = process.env.CODELAND_WORKERS.split(',').map(h => h.trim()).filter(Boolean);
	conf.workers = [...new Set([...(conf.workers || []), ...envWorkers])];
}

module.exports = conf;
