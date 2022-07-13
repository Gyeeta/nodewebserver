
'use strict';

const 			chalk = require('chalk');
			require('console-stamp')(console, { 
				format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
			});

const			fs = require('fs');
const 			crypto = require('crypto');

const			{safetypeof} = require("./gyutil.js");
const 			gyconfig = require('./gyconfig.js').getGlobalConfig();
const			jwt = require('./jwtauth.js');


const			MAX_USERS = 4096;
let			gusermap;

function basicInit()
{
	if (!gyconfig.userPassFile) {
		throw new Error('Basic authentication method set but no User Password File (userPassFile) specified in global config');
	}	

	try {
		const userpass = fs.readFileSync(gyconfig.userPassFile);

		if (!userpass || userpass.length === 0) {
			throw new Error(`Empty Basic authentication User Password File : ${gyconfig.userPassFile} : Please provide a valid file.`);
		}	

		let			tarr;

		try {
			tarr = JSON.parse(userpass);
		}
		catch(e) {
			throw new Error(`Basic authentication User Password file ${gyconfig.userPassFile} not in JSON format - Please specify the config file in JSON format : ${e}`);
		}	

		if (!Array.isArray(tarr)) {
			throw new Error(`Basic authentication User Password file ${gyconfig.userPassFile} not a JSON Array - Please specify the config file in a JSON Array format`);
		}	

		if (tarr.length === 0) {
			throw new Error(`Basic authentication User Password file ${gyconfig.userPassFile} is an empty JSON Array - Please specify valid objects in the JSON Array`);
		}	
		else if (tarr.length > MAX_USERS) {
			throw new Error(`Basic authentication User Password file ${gyconfig.userPassFile} Array has too many elements ${tarr.length} - Please specify max ${MAX_USERS} objects in the JSON Array`);
		}	

		const tmap = new Map();

		for (let obj of tarr) {
			if (safetypeof(obj) !== 'object') {
				throw new Error(`Basic authentication User Passwod file ${gyconfig.userPassFile} JSON Array element not of object format...`);
			}	

			if ((!obj.user) || (!obj.password && !obj.pass_sha256)) {
				throw new Error(`Basic authentication User Passwod file ${gyconfig.userPassFile} JSON Array element does not have mandatory property 'user' or either of 'password' or 'pass_sha256'`);
			}	

			const			p = obj.password ? obj.password : obj.pass_sha256;
			const			type = obj.password ? 'password' : 'pass_sha256';

			if ((typeof obj.user !== 'string') || (typeof p !== 'string')) {
				throw new Error(`Basic authentication User Passwod file ${gyconfig.userPassFile} JSON Array element does not have mandatory property in string format : 'user' or either of 'password' or 'pass_sha256'`);
			}

			let			role;

			if (obj.role) {
				if (Array.isArray(obj.role)) {
					role = obj.role;
				}
				else if (typeof obj.role === 'string') {
					role = [ obj.role ];
				}
				else {
					role = [ 'readonly' ]; 
				}	
			}
			else {
				role = [ 'readonly' ]; 
			}	

			tmap.set(obj.user, { pass : p, type, role });
		}

		gusermap = tmap;

		console.log(`Basic User Password Authentication specified : Total of ${gusermap.size} entries specified`);

	}
	catch(e) {
		throw new Error(`Exception caught while reading Basic User Password authentication config from ${gyconfig.userPassFile} : ${e}`);
	}	
}


function handleBasicAuth(req, res)
{
	try {
		if ((typeof req.body.username !== 'string') || (typeof req.body.password !== 'string')) {
			res.status(400).end(JSON.stringify({status : 'failed', error : 400, errmsg : 'Missing username or password fields' }));
			return;
		}	

		if (!gusermap) {
			res.status(500).end(JSON.stringify({status : 'failed', error : 500, errmsg : 'User Password Mapping not set yet!' }));
			return;
		}	

		const			uobj = gusermap.get(req.body.username); 
		let			pass;

		if (!uobj) {
			res.status(401).end(JSON.stringify({status : 'failed', error : 401, errmsg : 'Invalid Username or Password' }));
			return;
		}	

		if (uobj.type !== 'pass_sha256') {
			pass	= req.body.password;
		}	
		else {
			pass 	= crypto.createHash('sha256').update(req.body.password).digest('hex');
		}	

		if (uobj.pass !== pass) {
			res.status(401).end(JSON.stringify({status : 'failed', error : 401, errmsg : 'Invalid Username or Password' }));
			return;
		}	

		jwt.createJwt({ user : req.body.username, role : uobj.role })
			.then(token => {
				return res.status(200).end(JSON.stringify({
					status		: 'ok',
					user		: req.body.username,
					effrole		: jwt.getEffectiveRole(uobj.role),
					token 		: token, 
				}));
			})
			.catch(error => {
				return res.status(500).end(JSON.stringify({status : 'failed', error : 500, errmsg : error})); 
			});

	}
	catch(e) {
		console.error(`Exception caught while authentcating User Password : ${e}`);
		return res.status(500).end(JSON.stringify({status : 'failed', error : 500, errmsg : 'Exception caught while authenticating'})); 
	}	
}


module.exports = {
	basicInit,
	handleBasicAuth,
};	

