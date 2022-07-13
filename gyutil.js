'use strict';

const			fs = require('fs');

const Durmsec = {
	sec  	: 1000,
	min	: (60 * 1000),
	hour	: (60 * 60 * 1000),
	day	: (24 * 60 * 60 * 1000),
	week	: (7 * 24 * 60 * 60 * 1000),
	month	: (30 * 24 * 60 * 60 * 1000),
	year	: (365 * 24 * 60 * 60 * 1000),
};

function getRandomInt(min, max) 
{
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max, ndecimal = 2) 
{
	let		num = Math.random() * (max - min + 1) + min;

	return Number(num.toFixed(ndecimal));
}

function delayExec(millisec) 
{
	return new Promise(resolve => setTimeout(resolve, millisec));
}

	
function safetypeof(val, arrayAsObject = false)
{
	if (val === undefined) {
		return 'undefined';
	}

	if (val === null) {
		return 'null';
	}	

	if (false === arrayAsObject && Array.isArray(val)) {
		return 'array';
	}	

	return typeof val;
}	



function isEmptyObj(obj) 
{
	for (let x in obj) { 
		if (Object.prototype.hasOwnProperty.call(obj, x)) {
			return false;
		}	
	}

	return true;
}


function splitAndTrim(strin, separator = ',')
{
	return strin.split(separator).map((str) => str.trim()).filter((str) => str.length > 0);
}	


function escapeHtml(unsafestr)
{
	return unsafestr.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function printResourceUsage(prefix = '')
{
	const 			memuse = process.memoryUsage(), upsec = process.uptime();
	const			updays = upsec/(24 * 3600) | 0, uphrs = (upsec % (24 * 3600))/3600 | 0;

	console.log(`Process ${prefix} PID ${process.pid} Memory Stats : Resident Memory RSS ${memuse.rss >> 20} MB, Heap Used ${memuse.heapUsed >> 20} MB, Process Uptime ${updays} day(s) ${uphrs} hour(s)\n`);
}	

function logrotate(logfile, maxfilesz = 30 * 1024 * 1024)
{
	try {
		if (!logfile) {
			return;
		}	

		const			stat = fs.statSync(logfile, { throwIfNoEntry : false });

		if (!stat) {
			return;
		}	

		// console.log('Log file ', logfile, ' size is ', stat.size);

		if (stat.size > maxfilesz) {
			fs.copyFile(logfile, logfile  + '.bak', (err) => {
				try {
					if (err) {
						// Copy failed
					}	
					fs.truncateSync(logfile, 0);	
				}
				catch(error) {
				}	
			});
		}	
	}
	catch (e) {
	}	
}	

module.exports = {
	Durmsec,
	getRandomInt,
	getRandomFloat,
	delayExec,
	safetypeof,
	isEmptyObj,
	splitAndTrim,
	escapeHtml,
	printResourceUsage,
	logrotate,
};	

