
'use strict';

			require('dotenv').config();

const			fs = require('fs');
const 			forever = require('forever-monitor');

const			MAX_CHILD_EXITS = 10, MAX_LOG_SZ = 30 * 1024 * 1024;

const 			{logrotate} = require('./gyutil.js');

const 			{initGlobalConfig} = require('./gyconfig.js');
const			gyconfig = initGlobalConfig(false /* printcfg */);

process.on('SIGHUP', () => {
	// console.log('Controlling Terminal has exited. But continuing...');
});

process.on('exit', (code) => {
	// console.log('Forever Web Server exiting now with code : ', code);
});

process.on('uncaughtException', (err, origin) => {
	// fs.writeSync(process.stderr.fd, `[ERROR]: Forever Web Server Caught Unhandled Exception : ${err}` + ` : Exception origin : ${origin}`);

	// Keep running...
});


let	 		nodechild, oauthchild, logtimer, oauthlogtimer;
let			nodeexits = 0, oauthexits = 0;


nodechild = new (forever.Monitor)('gyapp.js', {
	max		: MAX_CHILD_EXITS,
	silent		: gyconfig.logFile ? true : false,
	args		: [],
	killTree	: true,		// Kill all children on exit

	outFile		: gyconfig.logFile,
	errFile		: gyconfig.logFile,
	append		: true,
});

nodechild.on('restart', function() {
	// console.error('Restarting gyapp node server since exit detected');

	if (!logtimer) {
		logtimer = setInterval(logrotate, 10000, gyconfig.logFile, MAX_LOG_SZ);
	}
});

nodechild.on('exit:code', function(code) {
	nodeexits++;
	// console.error('Gyeeta Web Server exited after with code ' + code + ` : Total exits so far = ${nodeexits}`);

	if (logtimer) {
		clearInterval(logtimer);
		logtimer = null;
	}

	if (nodeexits >= MAX_CHILD_EXITS && oauthchild) {
		// console.error('Gyeeta Web Server exited Max allowed times : Stopping oauth Server...');
		oauthchild.stop();
	}	
});

nodechild.start();

logtimer = setInterval(logrotate, 10000, gyconfig.logFile, MAX_LOG_SZ);


if (gyconfig.authType !== 'basic' && (typeof(gyconfig.oauth2ProxyCommand) === 'string' || Array.isArray(gyconfig.oauth2ProxyCommand))) {

	const			argarr = Array.isArray(gyconfig.oauth2ProxyCommand) ? gyconfig.oauth2ProxyCommand : gyconfig.oauth2ProxyCommand.split(' ');
	const			scriptarr = [ './oauth2-proxy', ...argarr];	

	oauthchild = forever.start(scriptarr, {
		max		: MAX_CHILD_EXITS,
		silent		: true,
		killTree	: true,		// Kill all children on exit

		outFile		: gyconfig.oauth2ProxyLogFile,
		errFile		: gyconfig.oauth2ProxyLogFile,
		append		: true,
	});

	oauthchild.on('restart', function() {
		// console.error('Restarting oauth proxy server since exit detected');
		
		if (!oauthlogtimer) {
			oauthlogtimer = setInterval(logrotate, 10000, gyconfig.oauth2ProxyLogFile, MAX_LOG_SZ);
		}
	});

	oauthchild.on('exit:code', function(code) {
		oauthexits++;
		// console.error('Forever detected oauth proxy server exited after multiple restarts with code ' + code + ` : Total exits so far = ${oauthexits}`);

		if (oauthlogtimer) {
			clearInterval(oauthlogtimer);
			oauthlogtimer = null;
		}

		if (oauthexits >= MAX_CHILD_EXITS) {
			// console.error('Forever oauth proxy server exited Max allowed times : Stopping Webserver...');
			nodechild.stop();
		}	
	});

	oauthchild.start();

	oauthlogtimer = setInterval(logrotate, 10000, gyconfig.oauth2ProxyLogFile, MAX_LOG_SZ);
}	



