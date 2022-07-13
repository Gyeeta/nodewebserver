'use strict';

			require('console-stamp')(console, { 
				format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
			});

const			fs = require('fs');
const			{safetypeof} = require("./gyutil.js");


let			gyconfig;

function initGlobalConfig(jsonConfigFile, isAlertAction)
{
	if (!jsonConfigFile) {
		console.error(`No Valid Config File specified for ${ isAlertAction ? "Alert Action Handler" : "Gyeeta Webserver"}`);
		process.exit(1);
	}	

	let			cfg;

	try {
		cfg = fs.readFileSync(jsonConfigFile);
	}
	catch (e) {
		console.error('Failed to read Config File ', jsonConfigFile, " : ", e);
		process.exit(1);
	}	

	try {
		gyconfig = JSON.parse(cfg);
	}
	catch (e) {
		console.error('Config File ', jsonConfigFile, " not in JSON format : ", e);
		process.exit(1);
	}	

	if (!isAlertAction) {
		validateWebConfig(jsonConfigFile);
	}	
	else {
		validateActionConfig(jsonConfigFile);
	}	

	gyconfig.projectName 	= 'Gyeeta';
	gyconfig.NodeHostname 	= require('os').hostname();

	return gyconfig;
}	

function validateWebConfig(jsonConfigFile)
{
	if (safetypeof(gyconfig) !== 'object') {
		console.error(`Invalid Config File : ${jsonConfigFile} : File not in JSON Object format`);
		process.exit(1);
	}	

	if (!gyconfig.ShyamaHostArr) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' not found`);
		process.exit(1);
	}	

	if (!gyconfig.ShyamaPortArr) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaPortArr' not found`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaHostArr)) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' not in JSON Array format`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaPortArr)) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaPortArr' not in JSON Array format`);
		process.exit(1);
	}	

	if (gyconfig.ShyamaHostArr.length !== gyconfig.ShyamaPortArr.length) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' and 'ShyamaPortArr' Array lengths differ in size`);
		process.exit(1);
	}	

	if (!gyconfig.NodePort) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Server Listener Port 'NodePort' not found`);
		process.exit(1);
	}	

	if (typeof gyconfig.NodePort !== 'number') {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Server Listener Port 'NodePort' not a number`);
		process.exit(1);
	}	

	if (!gyconfig.NodeIP) {
		gyconfig.NodeIP = '0.0.0.0';
	}	

	if (typeof gyconfig.authType == 'string') {
		/*
		 * Currentlyonly 'basic' authentication supported...
		 */
		if (gyconfig.authType !== 'basic') {
			console.error(`Invalid Config File : ${jsonConfigFile} : Config 'authType' has an unsupported value of ${gyconfig.authType} : `
					+ `Currently only 'basic' auth supported : 'oidc', 'oauth2' will be supported in a later release`);
			process.exit(1);
		}
	}	
	else {
		gyconfig.authType = 'basic';
	}	

	if (!gyconfig.userPassFile && gyconfig.authType === 'basic') {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Config option 'userPassFile' not specified for 'basic' authentication : `
				+ `Please specify 'userPassFile' as a JSON path : Check sample_userpass.json for a sample file`);
		process.exit(1);
	}	
	
	if (!gyconfig.tokenExpiry) {
		gyconfig.tokenExpiry = '1d';		// Default 1 day token expiry
	}	

	if (!gyconfig.jwtSecretFile && !gyconfig.jwtKeyFile) {
		console.error(`Invalid Config File : ${jsonConfigFile} : JWT Token Secret not specified : `
				+ `Please specify either a fixed secret file 'jwtSecretFile' or PEM Format Public Key for JWT Token file in 'jwtKeyFile' option`);
		process.exit(1);
	}	

	if (gyconfig.useHTTP && typeof gyconfig.useHTTP !== 'boolean') {
		console.error(`Invalid Config File : ${jsonConfigFile} : Please specify useHTTP as either true or false (boolean JSON type)`);
		process.exit(1);
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
			console.error(`Invalid Config File : ${jsonConfigFile} : TLS certificate File option 'tlsCertFile' not specified for HTTPS server`);
			process.exit(1);
		}	

		if (!gyconfig.tlsKeyFile) {
			console.error(`Invalid Config File : ${jsonConfigFile} : TLS Private Key File option 'tlsKeyFile' not specified for HTTPS server`);
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
}


function validateActionConfig(jsonConfigFile)
{
	if (safetypeof(gyconfig) !== 'object') {
		console.error(`Invalid Config File : ${jsonConfigFile} : File not in JSON Object format`);
		process.exit(1);
	}	

	if (!gyconfig.ShyamaHostArr) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' not found`);
		process.exit(1);
	}	

	if (!gyconfig.ShyamaPortArr) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaPortArr' not found`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaHostArr)) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' not in JSON Array format`);
		process.exit(1);
	}	

	if (!Array.isArray(gyconfig.ShyamaPortArr)) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaPortArr' not in JSON Array format`);
		process.exit(1);
	}	

	if (gyconfig.ShyamaHostArr.length !== gyconfig.ShyamaPortArr.length) {
		console.error(`Invalid Config File : ${jsonConfigFile} : Mandatory Shyama Server Config 'ShyamaHostArr' and 'ShyamaPortArr' Array lengths differ in size`);
		process.exit(1);
	}	

}

function getGlobalConfig()
{
	return gyconfig;
}	

module.exports = {
	initGlobalConfig,
	getGlobalConfig,
};	

