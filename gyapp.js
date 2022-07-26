
'use strict';

		require('dotenv').config();

const		http = require('http');
const		https = require('https');
const		fs = require('fs');

const 		createError = require('http-errors');
const 		express = require('express');
const 		morgan = require('morgan');
const 		path = require('path');
const 		cookieParser = require('cookie-parser');

if (process.argv.length === 3 && process.argv[2] === '--version') {
	console.log("Gyeeta Webserver Version : ", require('./gyeeta_comm.js').NODE_VERSION_STR);
	process.exit(0);
}


const 		chalk = require('chalk');

		require('console-stamp')(console, { 
			format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
		});

const 		{initGlobalConfig} = require('./gyconfig.js');
const		gyconfig = initGlobalConfig();

console.log(`Gyeeta Web Server Starting now for ${ gyconfig.useHTTP ? 'http://' : 'https://' }${gyconfig.NodeIP}:${gyconfig.NodePort} `);

const 		gyrouter = require('./gyrouter.js');

const 		app = express();

app.use(morgan('[:date[iso]]:[Query]: [:remote-addr] - [:method :url] :status :res[content-length] ":referrer" ":user-agent" [:response-time ms]'));

app.use(express.json({limit: '512kb'}));
app.use(express.urlencoded({limit: '512kb', extended: true}));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'frontend/build')));
app.use(express.static(path.join(__dirname, 'public')));

app.disable('x-powered-by');

// Disable Cache
app.set('etag', false);
app.use((req, res, next) => {
	res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
	next();
});

app.use('/', gyrouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
	next(createError(404, 'Gyeeta Error 404 : Requested Resource not found.'));
});


// error handler
app.use(function(err, req, res, next) {
	res.status(err.status || 500);
	next(createError(err.status || 500, `Gyeeta Webserver Error : ${err.message}`));
});

module.exports = app;

if (gyconfig.useHTTP === false && gyconfig.tlsCertFile && gyconfig.tlsKeyFile) {
	let		sslOptions;

	try {
		sslOptions = {
			key		: fs.readFileSync(gyconfig.tlsKeyFile),
			cert		: fs.readFileSync(gyconfig.tlsCertFile),
			passphrase	: gyconfig.tlsPassPhrase,
		};
	}
	catch (e) {
		console.error('Failed to read TLS Key or Certificate. ', e);
		process.exit(1);
	}	

	const httpsserver = https.createServer(sslOptions, app);

	httpsserver.listen(gyconfig.NodePort, gyconfig.NodeIP, function(err) {
		if (err) {
			console.error('Failed to start Node Web Server. ', err);
			process.exit(1);
		}
		console.log(`${gyconfig.projectName} Web Server is now listening on https://${gyconfig.NodeIP}:${gyconfig.NodePort}`);

		if (process.env.NODE_ENV !== 'production') {
			console.log('NOTE : Using Development Node Settings. Please set .env NODE_ENV=production if Production settings needed');
		}
	});

	httpsserver.on('error', function (err) {
		console.error('Node Web Server Error : Exiting now... ', err);
		process.exit(1);
	});

}
else if (gyconfig.useHTTP) {
	
	const httpserver = http.createServer(app);

	httpserver.listen(gyconfig.NodePort, gyconfig.NodeIP, function(err) {
		if (err) {
			console.error('Failed to start Node Web Server. ', err);
			process.exit(1);
		}
		console.log(`${gyconfig.projectName} Web Server is now listening on http://${gyconfig.NodeIP}:${gyconfig.NodePort}`);

		if (process.env.NODE_ENV !== 'production') {
			console.log('NOTE : Using Development Node Settings. Please set .env NODE_ENV=production if Production settings needed');
		}
	});

	httpserver.on('error', function (err) {
		console.error('Node Web Server Error : Exiting now... ', err);
		process.exit(1);
	});

}
else {
	console.error('HTTPS Server specified in gyconfig.js : But either of tlsCertFile or tlsKeyFile config option missing...');
	process.exit(1);
}

process.on('exit', (code) => {
	console.log('Node Web Server exiting now with code : ', code);
});

process.on('uncaughtException', (err, origin) => {
	fs.writeSync(process.stderr.fd, `[ERROR]: Node Webserver Caught Unhandled Exception : Exiting now... : ${err}\n` + `Exception origin: ${origin}`);

	process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('Unhandled Rejection seen at :', promise, ' reason : ', reason);
});

process.on('SIGHUP', () => {
	console.log('Node Web Server Controlling Terminal has exited. But continuing...');
});


