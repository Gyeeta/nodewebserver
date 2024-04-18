
'use strict';

const 			chalk = require('chalk');
			require('console-stamp')(console, { 
				format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
			});

const			{safetypeof} = require("./gyutil.js");
const 			gyconfig = require('./gyconfig.js').getGlobalConfig();

const 			jwt = require('jsonwebtoken');		
const			fs = require('fs');

const			MAX_JWT_CACHE = 1024, MAX_TOKEN_LEN = 2048;
const			tokenExpiry = gyconfig.tokenExpiry || '3d';
let			jwtCache, secretOrFile;

const			adminRegex = /\badmin\b/i, managerRegex = /\bmanager\b/i, readwriteRegex = /\breadwrite\b/i;


function checkCache()
{
	try {
		const			mintime = Date.now() - 240 * 1000;

		for (let [key, value] of jwtCache) {
			if (value.tstart < mintime) {
				jwtCache.delete(key);
			}	
		}
	}
	catch(e) {
	}	
}	

function jwtInit()
{
	if (!gyconfig.jwtSecret && !gyconfig.jwtKeyFile) {
		throw new Error('Mandatory JWT Secret or Key File not specified in global config : Please specify either of jwtSecret or jwtKeyFile ...');
	}	

	if (!gyconfig.jwtSecret) {
		try {
			secretOrFile = fs.readFileSync(gyconfig.jwtKeyFile);

			if (!secretOrFile || secretOrFile.length === 0) {
				throw new Error(`Empty JWT Key File : ${gyconfig.jwtKeyFile} : Please provide a valid configuration.`);
			}	
		}
		catch(e) {
			throw new Error(`Failed to read JWT Key File : ${gyconfig.jwtKeyFile} : ${e}`);
		}	
	}
	else {
		secretOrFile = gyconfig.jwtSecret;
	}	

	jwtCache = new Map();

	setInterval(() => { checkCache(); }, 60 * 1000);
}	

function getEffectiveRole(rolearr)
{
	if (!Array.isArray(rolearr)) {
		if (typeof rolearr === 'string') {
			if (adminRegex.test(rolearr)) {
				return 'admin';
			}	
			else if (managerRegex.test(rolearr)) {
				return 'manager';
			}	
			else if (readwriteRegex.test(rolearr)) {
				return 'readwrite';
			}	
		}	

		return 'readonly';
	}	

	let			ismanager, isreadwrite;

	for (let role of rolearr) {
		if (adminRegex.test(role)) {
			return 'admin';
		}	
		else if (managerRegex.test(rolearr)) {
			ismanager = true;
		}	
		else if (readwriteRegex.test(rolearr)) {
			isreadwrite = true;
		}	
	}	

	if (ismanager) {
		return 'manager';
	}

	if (isreadwrite) {
		return 'readwrite';
	}

	return 'readonly';
}


// Returns a promise
function verifyJwt(token)
{
	return new Promise((resolve, reject) => {
		try {
			if (!token) {
				reject("No Token present");
			}	

			let			addelem;

			if (token.length <= MAX_TOKEN_LEN) {
				const 			elem = jwtCache.get(token);

				if (elem) {
					if (elem.iserror) {
						reject(elem.errmsg);
					}	

					resolve(elem.data);

					return;
				}	

				if (jwtCache.size < MAX_JWT_CACHE) {
					addelem = true;	
				}	
			}	

			jwt.verify(token, secretOrFile, function(err, decoded) {
				let			outobj;

				if (err) {
					outobj = {
						iserror 	: true,
						errmsg		: err.message ?? 'Invalid Token',
						tstart		: Date.now(),
					};	
				}	
				else {
					outobj = {
						iserror		: false,
						data		: decoded,
						tstart		: Date.now(),
					};	
				}	

				if (addelem) {
					jwtCache.set(token, outobj);
				}	

				if (err) {
					reject(outobj.errmsg);
				}	
				else {
					resolve(outobj.data);
				}	
			});	
		
		}
		catch(e) {
			console.error(`Exception caught while verifying JWT Token : ${e}`);
			reject('Exception caught while verifying token');	
		}	
	});
}	

// Returns a promise : options object will be mutated if expiresIn missing
function createJwt(data, options = { expiresIn : tokenExpiry })
{
	let			odata;

	if (safetypeof(data) !== 'object') {
		odata = { data : data };	
	}
	else {
		odata = data;
	}	

	return new Promise((resolve, reject) => {
		try {
			if (!options.expiresIn) {
				options.expiresIn = tokenExpiry;
			}

			jwt.sign(odata, secretOrFile, options, function(err, token) {
				if (err) {
					reject(`Token creation failed ${err.message ?? ''}`);
				}	
				else {
					resolve(token);
				}	
			});	
		}
		catch(e) {
			console.error(`Exception caught while creating JWT Token : ${e}`);
			reject('Exception caught while creating token');	
		}	
	});
}	


module.exports = {
	jwtInit,
	getEffectiveRole,
	verifyJwt,
	createJwt,
};	

