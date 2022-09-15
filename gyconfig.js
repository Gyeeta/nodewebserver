'use strict';

			require('console-stamp')(console, { 
				format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
			});

const			fs = require('fs');
const 			moment = require('moment');

const			{safetypeof} = require("./gyutil.js");


let			gyconfig;

function initGlobalConfig(printcfg = true)
{
	const			env = process.env;
	let			cstr = '{\n\t', bstat;

	gyconfig = {};

	if (!env.CFG_SHYAMA_HOSTS) {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  'CFG_SHYAMA_HOSTS' not found : Please set CFG_SHYAMA_HOSTS value in .env file`);
		process.exit(1);
	}	
	
	if (env.CFG_SHYAMA_HOSTS[0] !== '[') {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config CFG_SHYAMA_HOSTS=${env.CFG_SHYAMA_HOSTS} not of JSON Array format`);
		process.exit(1);
	}	

	cstr += `"ShyamaHostArr" : ${env.CFG_SHYAMA_HOSTS},\n\t`;

	if (!env.CFG_SHYAMA_PORTS) {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  'CFG_SHYAMA_PORTS' not found : Please set CFG_SHYAMA_PORTS value in .env file`);
		process.exit(1);
	}	

	if (env.CFG_SHYAMA_PORTS[0] !== '[') {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  CFG_SHYAMA_PORTS=${env.CFG_SHYAMA_PORTS} not of JSON Array format`);
		process.exit(1);
	}	

	cstr += `"ShyamaPortArr" : ${env.CFG_SHYAMA_PORTS},\n\t`;

	if (env.CFG_LISTENER_PORT) {
		if (Number(env.CFG_LISTENER_PORT[0]) > 0) {
			cstr += `"NodePort" : ${env.CFG_LISTENER_PORT},\n\t`;
		}
		else {
			console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  CFG_LISTENER_PORT=${env.CFG_LISTENER_PORT} not of number format`);
			process.exit(1);
		}	
	}	
	else {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  'CFG_LISTENER_PORT' not found : Please set CFG_LISTENER_PORT value in .env file`);
		process.exit(1);
	}	

	if (env.CFG_LISTENER_IP) {
		if (env.CFG_LISTENER_IP[0] !== '"') {
			cstr += `"NodeIP" : "${env.CFG_LISTENER_IP}",\n\t`;
		}
		else {
			cstr += `"NodeIP" : ${env.CFG_LISTENER_IP},\n\t`;
		}	
	}	

	if (env.CFG_AUTHTYPE) {
		if (env.CFG_AUTHTYPE[0] !== '"') {
			cstr += `"authType" : "${env.CFG_AUTHTYPE}",\n\t`;
		}
		else {
			cstr += `"authType" : ${env.CFG_AUTHTYPE},\n\t`;
		}	
	}	

	if (env.CFG_USERPASSFILE) {
		if (env.CFG_USERPASSFILE[0] !== '"') {
			cstr += `"userPassFile" : "${env.CFG_USERPASSFILE}",\n\t`;
		}
		else {
			cstr += `"userPassFile" : ${env.CFG_USERPASSFILE},\n\t`;
		}	
	}

	if (env.CFG_TOKENEXPIRY) {
		if (env.CFG_TOKENEXPIRY[0] !== '"') {
			cstr += `"tokenExpiry" : "${env.CFG_TOKENEXPIRY}",\n\t`;
		}
		else {
			cstr += `"tokenExpiry" : ${env.CFG_TOKENEXPIRY},\n\t`;
		}	
	}

	if (env.CFG_JWTSECRET) {
		if (env.CFG_JWTSECRET[0] !== '"') {
			cstr += `"jwtSecret" : "${env.CFG_JWTSECRET}",\n\t`;
		}
		else {
			cstr += `"jwtSecret" : ${env.CFG_JWTSECRET},\n\t`;
		}	
	}

	if (env.CFG_JWTKEYFILE) {
		if (env.CFG_JWTKEYFILE[0] !== '"') {
			cstr += `"jwtKeyFile" : "${env.CFG_JWTKEYFILE}",\n\t`;
		}
		else {
			cstr += `"jwtKeyFile" : ${env.CFG_JWTKEYFILE},\n\t`;
		}	
	}	

	if (env.CFG_USEHTTP) {
		if (env.CFG_USEHTTP !== 'true' && env.CFG_USEHTTP !== 'false') {
			console.error(`Invalid Gyeeta Webserver Config : Environment Config  CFG_USEHTTP=${env.CFG_USEHTTP} not of boolean (true/false) format`);
			process.exit(1);
		}

		cstr += `"useHTTP" : ${env.CFG_USEHTTP},\n\t`;
	}

	if (env.CFG_TLSCERTFILE) {
		if (env.CFG_TLSCERTFILE[0] !== '"') {
			cstr += `"tlsCertFile" : "${env.CFG_TLSCERTFILE}",\n\t`;
		}
		else {
			cstr += `"tlsCertFile" : ${env.CFG_TLSCERTFILE},\n\t`;
		}	
	}	

	if (env.CFG_TLSKEYFILE) {
		if (env.CFG_TLSKEYFILE[0] !== '"') {
			cstr += `"tlsKeyFile" : "${env.CFG_TLSKEYFILE}",\n\t`;
		}
		else {
			cstr += `"tlsKeyFile" : ${env.CFG_TLSKEYFILE},\n\t`;
		}	
	}	

	if (env.CFG_LOGFILE) {
		if (env.CFG_LOGFILE[0] !== '"') {
			cstr += `"logFile" : "${env.CFG_LOGFILE}",\n\t`;
		}
		else {
			cstr += `"logFile" : ${env.CFG_LOGFILE},\n\t`;
		}	
	}	


	cstr += `"tinit" : "${moment().format()}"\n}`;

	if (printcfg) {
		console.info(`Gyeeta Webserver Config options : \n${cstr}`);
	}

	try {
		gyconfig = JSON.parse(cstr);
	}
	catch(e) {
		if (!printcfg) {
			console.info(`Gyeeta Webserver Config options : \n${cstr}`);
		}	
		console.error(`[ERROR]: Gyeeta Webserver Config not in JSON format : ${e}\n`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaHostArr)) {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config CFG_SHYAMA_HOSTS=${env.CFG_SHYAMA_HOSTS} not in JSON Array format`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaPortArr)) {
		console.error(`Invalid Gyeeta Webserver Config : Mandatory Environment Config  CFG_SHYAMA_PORTS=${env.CFG_SHYAMA_PORTS} not in JSON Array format`);
		process.exit(1);
	}	

	if (gyconfig.ShyamaHostArr.length !== gyconfig.ShyamaPortArr.length) {
		console.error(`Invalid Gyeeta Webserver Config : CFG_SHYAMA_HOSTS and CFG_SHYAMA_PORTS Array lengths differ in size`);
		process.exit(1);
	}	

	if (!gyconfig.NodeIP) {
		gyconfig.NodeIP = '0.0.0.0';
	}	

	if (gyconfig.authType) {
		/*
		 * Currently only 'basic' authentication supported...
		 */
		if (gyconfig.authType !== 'basic') {
			console.error(`Invalid Gyeeta Webserver Config : Config 'CFG_AUTHTYPE' has an unsupported value of ${gyconfig.authType} : `
					+ `Currently only 'basic' auth supported : 'oidc', 'oauth2' will be supported in a later release`);
			process.exit(1);
		}
	}	
	else {
		gyconfig.authType = 'basic';
	}	

	if (gyconfig.authType === 'basic') {
		if (!gyconfig.userPassFile) {
			if (!env.CFG_ADMINPASSWORD) {
				console.error(`Invalid Gyeeta Webserver Config : Mandatory Config option 'CFG_USERPASSFILE' not specified for 'basic' authentication : `
						+ `Please specify 'CFG_USERPASSFILE' path in .env : Check sample_userpass.json for a sample file`);
				process.exit(1);
			}
		}	
		else {
			bstat = fs.statSync(gyconfig.userPassFile, { throwIfNoEntry : false } );
			if (!bstat) {
				console.error(`Invalid Gyeeta Webserver Config : Config option CFG_USERPASSFILE=${gyconfig.userPassFile} specified but file not found`);
				process.exit(1);
			}
		}
	}
	
	if (!gyconfig.tokenExpiry) {
		gyconfig.tokenExpiry = '1d';		// Default 1 day token expiry
	}	

	if (!gyconfig.jwtSecret && !gyconfig.jwtKeyFile) {
		console.error(`Invalid Gyeeta Webserver Config : JWT Token Secret not specified : `
				+ `Please specify either a fixed secret CFG_JWTSECRET or PEM Format Public Key for JWT Token file in 'CFG_JWTKEYFILE' option`);
		process.exit(1);
	}

	if (gyconfig.jwtKeyFile && !gyconfig.jwtSecret) {
		bstat = fs.statSync(gyconfig.jwtKeyFile, { throwIfNoEntry : false } );
		if (!bstat) {
			console.error(`Invalid Gyeeta Webserver Config : Config option CFG_JWTKEYFILE=${gyconfig.jwtKeyFile} specified but file not found`);
			process.exit(1);
		}
	}	

	if (!gyconfig.useHTTP) {
		if (gyconfig.tlsCertFile && gyconfig.tlsKeyFile) {
			gyconfig.useHTTP = false;
		}
		else {
			gyconfig.useHTTP = true;
		}	
	}	

	if (gyconfig.useHTTP === false) {
		if (!gyconfig.tlsCertFile) {
			console.error(`Invalid Gyeeta Webserver Config : TLS certificate File config option 'CFG_TLSCERTFILE' not specified for HTTPS server`);
			process.exit(1);
		}	

		if (!gyconfig.tlsKeyFile) {
			console.error(`Invalid Gyeeta Webserver Config : TLS Private Key File config option 'CFG_TLSKEYFILE' not specified for HTTPS server`);
			process.exit(1);
		}	

		bstat = fs.statSync(gyconfig.tlsCertFile, { throwIfNoEntry : false } );
		if (!bstat) {
			console.error(`Invalid Gyeeta Webserver Config : Config option CFG_TLSCERTFILE=${gyconfig.tlsCertFile} specified but file not found`);
			process.exit(1);
		}

		bstat = fs.statSync(gyconfig.tlsKeyFile, { throwIfNoEntry : false } );
		if (!bstat) {
			console.error(`Invalid Gyeeta Webserver Config : Config option CFG_TLSKEYFILE=${gyconfig.tlsKeyFile} specified but file not found`);
			process.exit(1);
		}
	}	


	/*
	 * NOTES :
	 *
	 * In case of JWT PEM Private Key : in case both PEM and secret files are given, the PEM file will be considered.
	 *
	 * If TLS Private key is password protected : gyconfig.tlsPassPhrase	= '<Pass phrase>';
	 *
	 * If authType !== 'basic', to set the user and role from x-auth headers :
	 * X-Auth-Request-User, X-Auth-Request-Groups set from downstream oauth2 proxy
	 * uncomment the following line. This will also result in no JWT processing as
	 * the downstream proxy will send the user and groups (roles)
	 * 
	 * gyconfig.xauthHeaders		= true;					
	 *
	 * oauth2-proxy options : (For use with authType 'oidc' or 'oauth2')
	 * Refer to : https://oauth2-proxy.github.io/oauth2-proxy/docs/configuration/overview
	 *
	 * Note that for oauth2 proxy mode the TLS cert and key are passed within oauth2ProxyCommand itself.
	 * 
	 * gyconfig.oauth2ProxyCommand  	= '--provider=keycloak --client-id="clientid" --https-address=":8083" --tls-cert-file=/path/to/cert.pem --tls-key-file=/path/to/cert.key ... '
	 * gyconfig.oauth2ProxyLogFile		= '<Path to log file>';
	 *
	 */

	gyconfig.projectName 	= 'Gyeeta';
	gyconfig.NodeHostname 	= require('os').hostname();

	if (process.env.NODE_ENV !== "production") {
		console.log('NOTE : Using Development Node Settings. Please set .env NODE_ENV=production if Production settings needed');
	}

	return gyconfig;
}


function getGlobalConfig()
{
	return gyconfig;
}	

module.exports = {
	initGlobalConfig,
	getGlobalConfig,
};	

