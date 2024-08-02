'use strict';

const path = require('path');
const ejs = require('ejs')
const express = require('express');

// Set up the express app.
const app = express();

// List of front end node modules to be served
const frontEndModules = ['bootstrap', 'mustache', 'jquery', '@fortawesome',
	'moment', 'ace-builds', 'xterm', 'xterm-addon-fit', 'xterm-addon-attach',
	'xterm-addon-webgl',
];

// Hold list of functions to run when the server is ready
app.onListen = [function(){console.log('hello')}];

// Allow the express app to be exported into other files. 
module.exports = app;

// Build the conf object from the conf files.
app.conf = require('./conf');

// Grab the projects PubSub
app.ps = require('./controller/pubsub.js'); 

// Push pubsub over the socket and back.
app.onListen.push(function(){
	app.ps.subscribe(/./g, function(data, topic){
		app.io.emit('P2PSub', { topic, data });
	});                                 

	app.io.on('connection', (socket) => {
		socket.on('P2PSub', (msg) => {
			app.ps.publish(msg.topic, msg.data);
			socket.broadcast.emit('P2PSub', msg);
		});
	});
});

// Hold onto the auth middleware 
const middleware = require('./middleware/auth');

// load the JSON parser middleware. Express will parse JSON into native objects
// for any request that has JSON in its content type. 
app.use(express.json());
app.set('json spaces', 2);

// Set up the templating engine to build HTML for the front end.
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Have express server static content( images, CSS, browser JS) from the public
// local folder.
app.use('/static', express.static(path.join(__dirname, 'public')))

// Server front end modules
// https://stackoverflow.com/a/55700773/3140931
frontEndModules.forEach(dep => {
	app.use(`/static-modules/${dep}`, express.static(path.join(__dirname, `node_modules/${dep}`)))
});

// Routes for front end content.
app.use('/', require('./routes/render'));

// API route
app.use('/api/v1', require('./routes/api_v1'));

// Catch 404 and forward to error handler. If none of the above routes are
// used, this is what will be called.
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.message = 'Page not found'
	err.status = 404;
	next(err);
});

// Error handler. This is where `next()` will go on error
app.use(function(err, req, res, next) {
	console.error(err.status || res.status, err.name, req.method, req.url);
	if(![ 404].includes(err.status || res.status)){
		console.error(err.message);
		console.error(err.stack);
		console.error('=========================================');
	}

	res.status(err.status || 500);
	res.json({
		name: err.name,
		message: err.message,
		runner: err.runner && err.runner.name,
		duration: err.duration,
	});
});
