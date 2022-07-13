

'use strict';

const 		express = require('express');
const 		path = require('path');

const 		chalk = require('chalk');

		require('console-stamp')(console, { 
			format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
		});

const 		crypto = require('crypto');
const 		moment = require('moment');

const 		gyconfig = require('./gyconfig.js').getGlobalConfig();
const		jwt = require('./jwtauth.js');
const		basicauth = require('./basicauth.js');

const 		{GyeetaHandler, GyCommError, JsonMsgTypes, NodeMsgTypes, NodeQueryTypes, ErrorTypes} = require('./gyeeta_comm.js');
const 		{GyWebCache} = require("./gy_webcache.js");
const		{safetypeof, isEmptyObj, splitAndTrim, printResourceUsage} = require("./gyutil.js");

const 		router = express.Router();

module.exports = router;

const 		gyeetaHdlr = new GyeetaHandler(gyconfig.ShyamaHostArr, gyconfig.ShyamaPortArr, gyconfig.NodeHostname, gyconfig.NodePort, 8);

const		gcache = new GyWebCache('Gyeeta Web Cache');

const		parthaRegex = /^[0-9a-f]{32}$/;
const		madhavaRegex = /^[0-9a-f]{16}$/;
let		gtlastpassword = Date.now();

const		MAX_QUERY_STRLEN = 12 * 1024;

const NodeQueryCalls = {
	// XXX Ensure API is in lowercase

	// API endpoint	: { api : NodeQueryType, 			mincache(sec),	maxcache(sec), 	is_madhava_qry }
	hoststate	: { api : NodeQueryTypes.NM_HOST_STATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	cpumem		: { api : NodeQueryTypes.NM_CPU_MEM, 		mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	svcstate	: { api : NodeQueryTypes.NM_LISTENER_STATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	extsvcstate	: { api : NodeQueryTypes.NM_EXTSVCSTATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	topsvc		: { api : NodeQueryTypes.NM_TOP_LISTENERS, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	svcinfo		: { api : NodeQueryTypes.NM_LISTENER_INFO, 	mincache : 100,	maxcache : 600,	is_madhava_qry : true, },
	activeconn	: { api : NodeQueryTypes.NM_ACTIVE_CONN, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	extactiveconn	: { api : NodeQueryTypes.NM_EXTACTIVECONN, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	clientconn	: { api : NodeQueryTypes.NM_CLIENT_CONN, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	extclientconn	: { api : NodeQueryTypes.NM_EXTCLIENTCONN, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	svcsumm		: { api : NodeQueryTypes.NM_LISTENER_SUMM, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	svcprocmap	: { api : NodeQueryTypes.NM_LISTENPROC_MAP, 	mincache : 60,	maxcache : 600,	is_madhava_qry : true, },
	tophostprocs	: { api : NodeQueryTypes.NM_TOP_HOST_PROCS, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	topaggrprocs	: { api : NodeQueryTypes.NM_TOP_AGGR_PROCS, 	mincache : 7,	maxcache : 600,	is_madhava_qry : true, },
	getnotifymsg	: { api : NodeQueryTypes.NM_NOTIFY_MSG, 	mincache : 1,	maxcache : 600,	is_madhava_qry : true, },
	hostinfo	: { api : NodeQueryTypes.NM_HOST_INFO, 		mincache : 30,	maxcache : 600,	is_madhava_qry : true, },
	procinfo	: { api : NodeQueryTypes.NM_PROC_INFO, 		mincache : 60,	maxcache : 600,	is_madhava_qry : true, },
	procstate	: { api : NodeQueryTypes.NM_PROC_STATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },
	extprocstate	: { api : NodeQueryTypes.NM_EXTPROCSTATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : true, },

	clusterstate	: { api : NodeQueryTypes.NM_CLUSTER_STATE, 	mincache : 3,	maxcache : 600,	is_madhava_qry : false, },
	svcmeshclust	: { api : NodeQueryTypes.NS_SVC_MESH_CLUST, 	mincache : 100,	maxcache : 600,	is_madhava_qry : false, },
	svcipclust	: { api : NodeQueryTypes.NS_SVC_IP_CLUST, 	mincache : 100,	maxcache : 600,	is_madhava_qry : false, },

	// The mincache will be only for the QueryAPIs and not the CRUD Comands
	alerts		: { api : NodeQueryTypes.NS_ALERTS, 		mincache : 5,	maxcache : 600,	is_madhava_qry : false, },
	alertdef	: { api : NodeQueryTypes.NS_ALERTDEF, 		mincache : 10,	maxcache : 10,	is_madhava_qry : false, },
	inhibits	: { api : NodeQueryTypes.NS_INHIBITS, 		mincache : 10,	maxcache : 10,	is_madhava_qry : false, },
	silences	: { api : NodeQueryTypes.NS_SILENCES, 		mincache : 10,	maxcache : 10,	is_madhava_qry : false, },
	actions		: { api : NodeQueryTypes.NS_ACTIONS, 		mincache : 10,	maxcache : 10,	is_madhava_qry : false, },
	
	shyamastatus	: { api : NodeQueryTypes.NS_SHYAMASTATUS,	mincache : 30,	maxcache : 30,	is_madhava_qry : false, },
	madhavalist	: { api : NodeQueryTypes.NS_MADHAVA_LIST, 	mincache : 30,	maxcache : 30,	is_madhava_qry : false, },
	madhavastatus	: { api : NodeQueryTypes.NM_MADHAVASTATUS,	mincache : 30,	maxcache : 30,	is_madhava_qry : true, },
	parthalist	: { api : NodeQueryTypes.NM_PARTHALIST,		mincache : 30,	maxcache : 30,	is_madhava_qry : true, },

	multiquery	: { api : NodeQueryTypes.NM_MULTI_QUERY, 	mincache : 3,	maxcache : 10,	is_madhava_qry : true },		// Keep this last
};	

const subsysToApiCall = {
	madhavalist	:	'madhavalist',
	hoststate	:	'hoststate',
	cpumem		:	'cpumem',
	svcstate	:	'svcstate',
	extsvcstate	:	'extsvcstate',
	svcinfo		:	'svcinfo',
	svcsumm		:	'svcsumm',
	activeconn	:	'activeconn',
	extactiveconn	:	'extactiveconn',
	clientconn	:	'clientconn',
	extclientconn	:	'extclientconn',
	svcprocmap	:	'svcprocmap',
	notifymsg	:	'getnotifymsg',
	procstate	:	'procstate',
	extprocstate	:	'extprocstate',
	procinfo	:	'procinfo',
	hostinfo	:	'hostinfo',
	clusterstate	:	'clusterstate',
	svcmeshclust	:	'svcmeshclust',
	svcipclust	:	'svcipclust',
	alerts		:	'alerts',
	alertdef	:	'alertdef',
	inhibits	:	'inhibits',
	silences	:	'silences',
	actions		:	'actions',
	shyamastatus	:	'shyamastatus',
	madhavastatus	:	'madhavastatus',
	parthalist	:	'parthalist',
};	

function validateQueryCalls()
{
	for (let api in NodeQueryCalls) {
		if (NodeQueryCalls.hasOwnProperty(api)) {
			if (api.toLowerCase() !== api) {
				NodeQueryCalls[api.toLowerCase()] = NodeQueryCalls[api];
			}	
		}	
	}	

	for (let api in subsysToApiCall) {
		if (subsysToApiCall.hasOwnProperty(api)) {
			if (api.toLowerCase() !== api) {
				subsysToApiCall[api.toLowerCase()] = subsysToApiCall[api];
			}	
		}	
	}	
}	


const gstats = {
	ncalls		: 0,
	lastncalls	: 0,

	reset()
	{
		for (let prop in this) {
			if (typeof this[prop] === 'number') {
				this[prop] = 0;
			}
		}	
	},	

	print(durmin)
	{
		console.info(chalk.yellow(`Web Call Stats (last stats are for ${durmin} min ago) : ${JSON.stringify(this)}\n`));

		for (let prop in this) {
			if (typeof this[prop] === 'number' && !prop.startsWith('last')) {
				this[`last${prop}`] = this[prop];
			}
		}	
	},

	add(queryname)
	{
		this.ncalls++;

		if (this[queryname] >= 0) {
			this[queryname]++;
		}
		else {
			this[queryname] 		= 1;
			this[`last${queryname}`] 	= 0;
		}	
		
		if (this.ncalls > Number.MAX_SAFE_INTEGER - 100) {
			console.log(`Web Call Stats : Resetting Stats as Overflow likely...`);
			this.reset();
		}	
	}	
};	

function initRouter()
{
	try {
		switch (gyconfig.authType) {
		
		case 'basic' :
			if (gyconfig.xauthHeaders === true) {
				console.error(chalk.red(`Invalid Config Option for Basic Authentication : 'xauthHeaders' must not be set to true : Exiting...`));
				process.exit(1);
			}

			basicauth.basicInit();
			break;

		case 'oidc' :
		case 'oauth2' :
			console.log(`Authentication type set as ${gyconfig.authType} : Authentication will be done by downstream oauth2 proxy...`);
			break;

		default :
			console.error(chalk.red(`Invalid Authentication Type set : ${gyconfig.authType ?? ''} : Please specify either of 'basic', 'oidc', 'oauth2' : Exiting...`));
			process.exit(1);
		}

		if (gyconfig.authType !== 'basic' && gyconfig.xauthHeaders === true) {
			// No JWT Processing
		}
		else {
			jwt.jwtInit();
		}

		validateQueryCalls();
		
		setInterval(() => { gstats.print(5); printResourceUsage(); }, 300 * 1000);

	}
	catch(e) {
		console.error(chalk.red(`Exception caught during init : Exiting... : ${e}`));
		process.exit(1);
	}	
}

initRouter();

function getNodeType(queryname)
{
	if (typeof queryname !== 'string') {
		throw new Error(`Invalid Query API name format`);
	}

	const		type = NodeQueryCalls[queryname];
	
	if (type === undefined) {
		throw new Error(`Invalid Query API name ${queryname}`);
	}
	
	gstats.add(queryname);

	return type;
}	

function get_resp_str_status(respstr)
{
	if (typeof respstr !== 'string') {
		return 200;
	}

	if (false === respstr.includes('"error"')) {
		return 200;
	}	

	try {
		const rstat = JSON.parse(respstr);

		if (rstat && rstat.error && rstat.error >= 200 && rstat.error <= 599) {
			return Number(rstat.error);
		}	

		return 200;
	}
	catch (e) {
		return 200;
	}	
}	

/*
 * response is either a string or an Array of strings (for single Madhava) or an Array of Array of strings (for Multiple Madhava)
 * If string, sent as is. Else sent as [string1, string2...]
 */
function sendResponse(res, respdata)
{
	let			rstatus = 200, err = 0, ok = 0, lstatus = 0, totbytes = 0, multimadhav = false;
	let			response, reset_cache = false;

	/*debugger;*/

	if (typeof respdata === 'string') {
		if (respdata.length < 4096) {
			rstatus = get_resp_str_status(respdata);
		}

		res.status(rstatus).end(respdata);

		return {status : rstatus, len : respdata.length};
	}	
	
	/*
	 * Strip off the respcode before sending the data. 
	 * So in case of an error from respcode, we need to reset cache or else on next cache hit a Resp Code of 200 will be sent.
	 */
	if (safetypeof(respdata) === 'object') {
		// Single Madhava/Shyama respdata
		if (respdata.respcode !== undefined) {
			rstatus = respdata.respcode;

			if (rstatus >= 300) {
				reset_cache = true;
				res.statusCode = rstatus;
			}
		}	
		response = respdata.data;

		if (!response) {
			throw new GyCommError(`Internal Error : Response object not of a valid format as data field absent`);
		}	
	}
	else if (Array.isArray(respdata)) {
		// Multi Madhava
		for (let j = 0; j < respdata.length; ++j) {

			if (safetypeof(respdata[j]) === 'object') {

				if (respdata[j].respcode !== undefined) {
					lstatus = respdata[j].respcode;

					if (lstatus >= 300) {
						rstatus = lstatus;
						err++;
					}
					else {
						ok++;
					}	
				}
				else if (respdata[j].data) {
					ok++;
				}	
				else {
					throw new GyCommError(`Internal Error : Multi Madhava Response Array data field not present`);
				}	

				respdata[j] = respdata[j].data;
			}
		}

		/*
		 * NOTE : We set the status as Erored even if one of the Madhava's responded with an error and others succeeded.
		 */
		if (err > 0 && rstatus >= 300) {
			reset_cache = true;
			res.statusCode = rstatus;
		}	

		response = respdata;
	}	
	else {
		throw new GyCommError(`Internal Error : Response is neither an object nor an array : ${typeof respdata}`);
	}	

	if (typeof response === 'string') {
		res.end(response);

		return {status : rstatus, len : response.length};
	}	
	
	if (Array.isArray(response)) {

		res.write('[');
		totbytes++;
		
		for (let i = 0; i < response.length; ++i) {
			if (typeof response[i] === 'string') {

				res.write(response[i]);
				totbytes += response[i].length;
			}	
			else if (Array.isArray(response[i])) {
				multimadhav = true;

				let		arr = response[i];

				for (let j = 0; j < arr.length; ++j) {

					if (typeof arr[j] === 'string') {

						res.write(arr[j]);
						totbytes += arr[j].length;
					}
					else {
						throw new GyCommError(`Internal Error : Response Array sub element is not a string : ${typeof arr[j]}`);
					}	
				}
			}	
			else {
				throw new GyCommError(`Internal Error : Response Array element is not a string : ${typeof response[i]}`);
			}	

			if (multimadhav) {	
				if (i + 1 < response.length) {
					res.write(',');
					totbytes++;
				}	
			}
		}
		
		res.end(']');
		totbytes++;

		return {status : rstatus, len : totbytes};
	}	

	throw new GyCommError(`Internal Error : Response is neither a string nor an array : ${typeof response}`);
}	

// Returns ispast boolean or null on error after sending response error to client
function getStartEndTimes(req, res, qry, point_in_time_ok = true)
{
	let			ispast = false;

	qry.pointintime = req.body.pointintime;

	if ((req.body.endtime && req.body.starttime) || (req.body.starttimeoffsetsec && req.body.endtimeoffsetsec)) {
		let			dstart, dcurr, dend;

		if (!(req.body.endtime && req.body.starttime)) {
			let 		starttimeoffsetsec = Number(req.body.starttimeoffsetsec);
			let 		endtimeoffsetsec = Number(req.body.endtimeoffsetsec);

			if (true === isNaN(starttimeoffsetsec)) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid starttimeoffsetsec parameter : Not a Number : ${req.body.starttimeoffsetsec}`}));
				console.error(`Invalid starttimeoffsetsec parameter : ${req.body.starttimeoffsetsec}`);
				return null;
			}	
			else if (starttimeoffsetsec < 0) {
				starttimeoffsetsec = -starttimeoffsetsec;
			}	

			if (true === isNaN(endtimeoffsetsec)) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid endtimeoffsetsec parameter : Not a Number : ${req.body.endtimeoffsetsec}`}));
				console.error(`Invalid endtimeoffsetsec parameter : ${req.body.endtimeoffsetsec}`);
				return null;
			}	
			else if (endtimeoffsetsec < 0) {
				endtimeoffsetsec = -endtimeoffsetsec;
			}	

			if (endtimeoffsetsec > starttimeoffsetsec) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `endtimeoffsetsec cannot be greater than starttimeoffsetsec parameter`}));
				console.error(`endtimeoffsetsec > starttimeoffsetsec parameter : ${req.body.endtimeoffsetsec} : ${req.body.starttimeoffsetsec}`);
				return null;
			}	

			dstart = moment().subtract(starttimeoffsetsec, 'seconds');
			dcurr = moment();
			dend = moment().subtract(endtimeoffsetsec, 'seconds');

			qry.starttime	= dstart.format();
			qry.endtime	= dend.format();
		}
		else {
			dstart = moment(req.body.starttime, moment.ISO_8601);
			dcurr = moment();
			dend = moment(req.body.endtime, moment.ISO_8601);

			if (false === dstart.isValid()) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid starttime specified : ${req.body.starttime}`}));
				console.error(`Invalid starttime specified : ${req.body.starttime}`);
				return null;
			}	

			if (false === dend.isValid()) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid endtime specified : ${req.body.endtime}`}));
				console.error(`Invalid endtime specified : ${req.body.endtime}`);
				return null;
			}	

			if (dend < dstart) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, 
								errmsg : `Invalid endtime specified : endtime ${req.body.endtime} is less than starttime ${req.body.starttime}`}));
				console.error(`Invalid endtime specified : endtime < starttime ${req.body.endtime}`);
				return null;
			}
			else if (dstart > dcurr) {
				if (dstart.unix() > dcurr.unix() + 50) {
					res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid starttime specified : starttime ${req.body.starttime} is in future`}));
					console.error(`Invalid starttime specified : starttime in future ${req.body.starttime}`);
					return null;
				}	
			}	

			qry.starttime	= req.body.starttime;
			qry.endtime	= req.body.endtime;
		}
		
		if (dstart.unix() <= dcurr.unix() - 30) {
			if (dend > dcurr) {
				// Allow for some time diffs
				if (dcurr.unix() + 20 > dend.unix()) {
					ispast = true;
				}
			}	
			else {
				ispast = true;
			}	
		}
	}	
	else if (req.body.starttime) {

		if (point_in_time_ok === true) {
			const		dstart = moment(req.body.starttime, moment.ISO_8601);
			const		dcurr = moment();

			if (false === dstart.isValid()) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid starttime specified : ${req.body.starttime}`}));
				console.error(`Invalid starttime specified : ${req.body.starttime}`);
				return null;
			}	

			if (dstart.unix() > dcurr.unix() + 15) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid starttime specified : starttime ${req.body.starttime} is in future`}));
				console.error(`Invalid starttime specified : starttime in future ${req.body.starttime}`);
				return null;
			}	
			else if (dstart.unix() < dcurr.unix() - 10) {
				qry.starttime	= dstart.subtract(4, 'seconds').format();
				qry.endtime	= dstart.add(4 + 4, 'seconds').format();
				
				if (dstart.unix() < dcurr.unix() - 30) {
					ispast = true;
				}
			}

			// Set pointintime to indicate only 1 record within the timerange needed
			qry.pointintime	= true;
		}
		else {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Missing endtime parameter`}));
			console.error(`Missing endtime parameter`);
			return null;
		}	
	}
	else if (req.body.endtime) {
		res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Missing starttime parameter`}));
		console.error(`Missing starttime parameter`);
		return null;
	}	
	else if (req.body.timeoffsetsec) {
		let 		timeoffsetsec = Number(req.body.timeoffsetsec);

		if (true === isNaN(timeoffsetsec)) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid timeoffsetsec parameter : Not a Number : ${req.body.timeoffsetsec}`}));
			console.error(`Invalid timeoffsetsec parameter : ${req.body.timeoffsetsec}`);
			return null;
		}	
		else if (timeoffsetsec < 0) {
			timeoffsetsec = -timeoffsetsec;
		}	

		if (timeoffsetsec > 2 * 365 * 24 * 3600) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid timeoffsetsec parameter : Number too large : ${req.body.timeoffsetsec}`}));
			console.error(`Invalid timeoffsetsec parameter : ${req.body.timeoffsetsec}`);
			return null;
		}	

		if (timeoffsetsec > 30) {
			ispast = true;
		}
		
		if (timeoffsetsec >= 5) {
			qry.starttime	= moment().subtract(timeoffsetsec, 'seconds').format();
			qry.endtime	= moment().format();
		}
	}	

	return ispast;
}	

function handleQueryApi(req, res, qname, curr_query_cachesec, resp_callback)
{
	try {
		let			madhava, endtime, ismultihost, qtype, cachesec, maxcache, madfilterarr = [], multiquery, is_madhava_qry;
		let			timeoutsec = 100;

		let			apicall = getNodeType(qname);

		qtype 		= apicall.api;

		if (typeof curr_query_cachesec === 'number') {
			cachesec = curr_query_cachesec;
			maxcache = cachesec;
		}
		else {
			cachesec = apicall.mincache;
			maxcache = apicall.maxcache;
		}

		is_madhava_qry	= apicall.is_madhava_qry;

		multiquery 	= (qtype === NodeQueryTypes.NM_MULTI_QUERY);

		if ((typeof req.body.parid === 'string') || (!is_madhava_qry)) {
			ismultihost = false;
		}	
		else {
			ismultihost = true;
		}	

		let qry = { 
			mtype 		: NodeMsgTypes.NODE_MSG_QUERY, 
			qtype 		: qtype,
			parid		: req.body.parid,
		};

		let 			ispast = getStartEndTimes(req, res, qry);

		if (ispast === null) {
			return;
		}

		if ((ispast === true) && (cachesec < maxcache)) {
			cachesec = maxcache;
		}	

		if (req.body.timeoutsec) {

			timeoutsec = Number(req.body.timeoutsec);
			if ((true === isNaN(timeoutsec)) || (timeoutsec <= 0)) {
				timeoutsec = 100;
			}
		}

		if (false === multiquery) {
			if (req.body.filter) {
				if (typeof req.body.filter !== "string") {
					res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, 
								errmsg : `Invalid filter type specified : ${typeof req.body.filter} : filter must be a string`}));
					console.error(`Invalid filter data type specified`);
					return null;
				}

				qry.filter = req.body.filter;
			}	

			if (req.body.options) {
				if (safetypeof(req.body.options) === 'object') {
					qry.options = req.body.options;
				}	
				else {
					res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, 
								errmsg : `Invalid options type specified : ${typeof req.body.options} : options must be a JSON Object`}));
					console.error(`Invalid options data type specified`);
					return null;
				}
			}
		}
		else {
			qry.multiqueryarr = req.body.multiqueryarr;
		}	

		res.type('json');

		const 			qrystr	= JSON.stringify(qry);

		if (qrystr.length > MAX_QUERY_STRLEN) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, 
							errmsg : `Max Query Length ${MAX_QUERY_STRLEN} exceeded : ${qrystr.length} : Please reduce the query size`}));
			return;
		}	

		const			shyamaHdlr = gyeetaHdlr.get_shyama_handler();
		
		if (is_madhava_qry) {
			if ((ismultihost === false) || (typeof req.body.madid === 'string')) {
				if (req.body.madid === undefined) {

					if (typeof req.body.parid !== 'string') {
						res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid Partha ID parid parameter : ${req.body.parid}`}));
						return;
					}

					if (null === req.body.parid.match(parthaRegex)) {
						res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid Partha ID parid parameter : ${req.body.parid}`}));
						return;
					}

					try {
						madhava = shyamaHdlr.get_madhava_from_parthaid(req.body.parid);
					}
					catch(e) {
						res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Invalid or Unknown Partha ID parid Parameter : ' + e}));
						return;
					}	
				}	
				else {
					if (null === req.body.madid.match(madhavaRegex)) {
						res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid Madhava ID madid parameter : ${req.body.madid}`}));
						return;
					}

					try {
						madhava = shyamaHdlr.get_madhava_from_madhavaid(req.body.madid);
					}
					catch(e) {
						res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Invalid or Unknown Madhava ID madid Parameter : ' + e}));
						return;
					}	
				}	
			}
			else if (req.body.madfilterarr && (Array.isArray(req.body.madfilterarr) === true)) {
				madfilterarr = req.body.madfilterarr;
			}	
		}

		if (typeof resp_callback !== 'function') {
			resp_callback = sendResponse;
		}

		const api_call = function() 
		{
			if (is_madhava_qry) {
				if (madhava !== undefined) {
					console.debug(`Sending single Madhava Query : ${qrystr.slice(0, 256)} : Cache Time ${cachesec} sec : Original req.body was ${JSON.stringify(req.body)}`);
					return shyamaHdlr.send_madhava_query(qrystr, madhava, true, timeoutsec);
				}
				else {
					console.debug(`Sending multi Madhava ${madfilterarr.length > 0 ? 'Filtered' : ''} Query : ${qrystr.slice(0, 256)} : ` + 
							`Cache Time ${cachesec} sec : Original req.body was ${JSON.stringify(req.body)}`);
					/*
					 * XXX We do not currently merge the resultsets of multiple madhava's
					 */
					return shyamaHdlr.send_all_madhava_query(qrystr, true, timeoutsec, madfilterarr, true /* fail_on_error */, JsonMsgTypes.QUERY_WEB_JSON);
				}	
			}
			else {
				console.debug(`Sending Shyama Query : ${qrystr.slice(0, 256)} : Cache Time ${cachesec} sec : Original req.body was ${JSON.stringify(req.body)}`);
				return shyamaHdlr.send_shyama_query(qrystr, true, timeoutsec);
			}	
		};

		if (cachesec > 0) {
			const			key 	= crypto.createHash('md5').update(qrystr).digest('hex');
			
			gcache.get_response(key, qrystr, cachesec, res, api_call, resp_callback);
		}
		else {
			api_call().then((result) => {
				resp_callback(res, result);
			})
			.catch((error) => {
				console.error(`There has been an error in the API call for query '${qrystr}' : ${error}`)
				res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `${error}`}));
			})
			.catch((error) => {
				console.error(`Error while handling catch exception : ${error}`)
			});
		}	
	}
	catch (e) {
		console.error(`Query handling for "${qname}" caused an exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}	

function handleCRUDapi(req, res, qname, mtype, jsontype, data, is_madhava_qry, allow_all_madhava, resp_callback)
{
	try {
		let			madhava, madfilterarr = [];
		let			timeoutsec = 100, qtype;
		let			apicall = getNodeType(qname);

		qtype 			= apicall.api;

		if (!(qtype > NodeQueryTypes.NN_MIN_TYPE && qtype < NodeQueryTypes.NM_MULTI_QUERY)) {
			res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Internal Error : Invalid qname specified : ${qname} for CRUD operation`}));
			return;
		}	

		if (mtype !== NodeMsgTypes.NODE_MSG_ADD && mtype !== NodeMsgTypes.NODE_MSG_UPDATE && mtype !== NodeMsgTypes.NODE_MSG_DELETE) {
			res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Internal Route Error : Invalid mtype specified : ${mtype} for ${qname} CRUD operation`}));
			return;
		}

		if (!data) {
			data = {};
		}

		let qry = { 
			mtype, 
			qtype,
			data,
		};

		if (data.timeoutsec) {

			timeoutsec = Number(data.timeoutsec);
			if ((true === isNaN(timeoutsec)) || (timeoutsec <= 0)) {
				timeoutsec = 100;
			}
		}
		
		res.type('json');

		const 			qrystr	= JSON.stringify(qry);

		if (qrystr.length > MAX_QUERY_STRLEN) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, 
								errmsg : `Max Query Length ${MAX_QUERY_STRLEN} exceeded : ${qrystr.length} : Please reduce the query size`}));
			return;
		}	

		const			shyamaHdlr = gyeetaHdlr.get_shyama_handler();

		if (is_madhava_qry) {
			if (typeof data.madid === 'string') {
				if (null === data.madid.match(madhavaRegex)) {
					res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Invalid Madhava ID madid parameter : ${data.madid} for ${qname}`}));
					return;
				}

				try {
					madhava = shyamaHdlr.get_madhava_from_madhavaid(data.madid);
				}
				catch(e) {
					res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Invalid Madhava ID madid Parameter : ' + e}));
					return;
				}	
			}
			else if (data.madfilterarr && (Array.isArray(data.madfilterarr) === true)) {
				madfilterarr = data.madfilterarr;
			}	
			else if (!allow_all_madhava) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Missing Madhava ID madid parameter for CRUD Madhava related request for ${qname}`}));
				return;
			}	
		}

		if (typeof resp_callback !== 'function') {
			resp_callback = sendResponse;
		}

		const api_call = function() 
		{
			if (is_madhava_qry) {
				if (madhava !== undefined) {
					console.debug(`Sending single Madhava CRUD Query : ${qrystr.slice(0, 256)}`);
					return shyamaHdlr.send_madhava_query(qrystr, madhava, true, timeoutsec, jsontype);
				}
				else {
					console.debug(`Sending multi Madhava ${madfilterarr.length > 0 ? 'Filtered' : ''} CRUD Query : ${qrystr.slice(0, 256)}`);
					return shyamaHdlr.send_all_madhava_query(qrystr, true, timeoutsec, madfilterarr, true /* fail_on_error */, jsontype);
				}	
			}
			else {
				console.debug(`Sending Shyama CRUD Query : ${qrystr.slice(0, 256)}`);
				return shyamaHdlr.send_shyama_query(qrystr, true, timeoutsec, jsontype);
			}	
		};

		api_call().then((result) => {
			resp_callback(res, result);
		})
		.catch((error) => {
			console.error(`There has been an error in the CRUD API call for query '${qrystr}' : ${error}`)
			res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `${error}`}));
		})
		.catch((error) => {
			console.error(`Error while handling catch exception : ${error}`)
		});
	}
	catch (e) {
		console.error(`CRUD Query handling for ${qname} caused an exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}

function handleNodeLocalQuery(req, res, qname, api_call, cachesec, resp_callback)
{
	try {
		let			timeoutsec = 100;

		if (typeof api_call !== 'function') {
			throw new Error(`Internal Error : Node Local Query for ${qname} called with invalid api callback`);
		}

		if (req.body.timeoutsec) {

			timeoutsec = Number(req.body.timeoutsec);
			if ((true === isNaN(timeoutsec)) || (timeoutsec <= 0)) {
				timeoutsec = 100;
			}
		}

		const 			qrystr	= JSON.stringify(req.body);

		res.type('json');

		if (typeof resp_callback !== 'function') {
			resp_callback = sendResponse;
		}

		if (cachesec > 0) {
			const			key 	= crypto.createHash('md5').update(qrystr).digest('hex');
			
			gcache.get_response(key, qrystr, cachesec, res, api_call, resp_callback);
		}
		else {
			api_call().then((result) => {
				resp_callback(res, result);
			})
			.catch((error) => {
				console.error(`There has been an error in the API call for query '${qrystr}' : ${error}`)
				res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `${error}`}));
			})
			.catch((error) => {
				console.error(`Error while handling catch exception : ${error}`)
			});
		}	
	}
	catch (e) {
		console.error(`Query handling for "${qname}" caused an exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}



function validateUser(req, res, next)
{
	try {

		if ((gyconfig.xauthHeaders === true) && (gyconfig.authType !== 'basic')) {

			const 			huser = req.headers['x-auth-request-user'];
			const 			hrole = req.headers['x-auth-request-groups'];
			let			rolarr;
			
			if (typeof huser === 'string' && huser.length > 0) {
				req.user = huser;
			}	
			else {
				req.user = 'unknown';
			}	
			
			if (!hrole) {
				res.status(401).end(JSON.stringify({error :  401, errmsg : 'Missing x-auth-request-groups header : Please configure downstream oauth2 reverse proxy server'}));
				return;
			}	
			else if (safetypeof(hrole) === 'object') {
				rolarr = [ JSON.stringify(hrole) ];
			}
			else if (typeof hrole === 'string') {
				rolarr = splitAndTrim(hrole, ',');
			}	
			else if (Array.isArray(hrole)) {
				rolarr = hrole;
			}	
			else {
				res.status(401).end(JSON.stringify({error : 401, errmsg : 'Invalid x-auth-request-groups header : Not a string or array'}));
				return;
			}

			req.effrole = jwt.getEffectiveRole(rolarr);
			
			return next();
		}	
		
		const authHeader = req.headers['authorization'];
		
		if (!authHeader) {
			res.status(401).end(JSON.stringify({error :  401, errmsg : `Missing Authorization Header: Please ${ gyconfig.authType === 'basic' ? "login and " : ""}set the Bearer Token first...`}));
			return;
		}	

		const authArr = authHeader.split(' ');

		if (authArr[0].toLowerCase() !== 'bearer') {
			if (authArr[0].toLowerCase() === 'basic') {
				res.status(401).end(JSON.stringify({error :  401, errmsg : 'Missing Authorization Bearer Token Header: Please set the Bearer Token instead of Basic Auth Header...'}));
				return;
			}	

			res.status(401).end(JSON.stringify({error :  401, errmsg : 'Missing Authorization Bearer Token Header: Please set the Bearer Token...'}));
			return;
		}

		const token = authArr[1];

		if (!token) {
			res.status(401).end(JSON.stringify({error :  401, errmsg : 'Missing Authorization Bearer Token'}));
			return;
		}	

		jwt.verifyJwt(token)
			.then(data => {
				req.user 	= data.user ? data.user : 'unknown';
				req.effrole 	= jwt.getEffectiveRole(data.role);

				return next();
			})
			.catch(err => {
				res.status(401).end(JSON.stringify({error :  401, errmsg : `Invalid Bearer Token : ${err}`}));
				return;
			});	

	}
	catch(e) {
		console.error(`Exception caught while checking auth headers : ${e}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}	

function validateAdmin(req, res, next)
{
	if (req.effrole === 'admin') {
		return next();
	}
	else {
		res.status(403).end(JSON.stringify({error :  403, errmsg : 'Require Admin Role'}));
		return;
	}	
}	

function validateReadWriteRole(req, res, next)
{
	if (req.effrole === 'readwrite' || req.effrole === 'admin') {
		return next();
	}
	else {
		res.status(403).end(JSON.stringify({error :  403, errmsg : 'Require ReadWrite Role'}));
		return;
	}	
}	


/*
 * Routes follow...
 *
 * <Base URL>/, <Base URL>/ui/* will result in Web UI being rendered.
 *
 * <Base URL>/v1/* will result in an API call
 */
router.get('/', function(req, res, next) {
	res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

router.get('/ui', function(req, res, next) {
	res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

router.get('/ui/*', function(req, res, next) {
	res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});


/*
 * API Calls follow
 */

router.post('/v1/hoststate', [validateUser], hoststate);	

router.get('/v1/hoststate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	hoststate(req, res);
});	

function hoststate(req, res) 
{
	handleQueryApi(req, res, "hoststate");
}

router.post('/v1/cpumem', [validateUser], cpumem);	

router.get('/v1/cpumem', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	cpumem(req, res);
});	

function cpumem(req, res) 
{
	handleQueryApi(req, res, "cpumem");
}

router.post('/v1/svcstate', [validateUser], svcstate);	

router.get('/v1/svcstate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcstate(req, res);
});	

function svcstate(req, res) 
{
	handleQueryApi(req, res, "svcstate");
}

router.post('/v1/extsvcstate', [validateUser], extsvcstate);	

router.get('/v1/extsvcstate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	extsvcstate(req, res);
});	

function extsvcstate(req, res) 
{
	handleQueryApi(req, res, "extsvcstate");
}


router.post('/v1/topsvc', [validateUser], topsvc);	

router.get('/v1/topsvc', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	topsvc(req, res);
});	

function topsvc(req, res) 
{
	handleQueryApi(req, res, "topsvc");
}

router.post('/v1/svcinfo', [validateUser], svcinfo);	

router.get('/v1/svcinfo', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcinfo(req, res);
});	

function svcinfo(req, res) 
{
	handleQueryApi(req, res, "svcinfo");
}

router.post('/v1/activeconn', [validateUser], activeconn);	

router.get('/v1/activeconn', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	activeconn(req, res);
});	

function activeconn(req, res) 
{
	handleQueryApi(req, res, "activeconn");
}

router.post('/v1/extactiveconn', [validateUser], extactiveconn);	

router.get('/v1/extactiveconn', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	extactiveconn(req, res);
});	

function extactiveconn(req, res) 
{
	handleQueryApi(req, res, "extactiveconn");
}


router.post('/v1/clientconn', [validateUser], clientconn);	

router.get('/v1/clientconn', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	clientconn(req, res);
});	

function clientconn(req, res) 
{
	handleQueryApi(req, res, "clientconn");
}

router.post('/v1/extclientconn', [validateUser], extclientconn);	

router.get('/v1/extclientconn', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	extclientconn(req, res);
});	

function extclientconn(req, res) 
{
	handleQueryApi(req, res, "extclientconn");
}


router.post('/v1/svcsumm', [validateUser], svcsumm);	

router.get('/v1/svcsumm', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcsumm(req, res);
});	

function svcsumm(req, res) 
{
	handleQueryApi(req, res, "svcsumm");
}

router.post('/v1/svcprocmap', [validateUser], svcprocmap);	

router.get('/v1/svcprocmap', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcprocmap(req, res);
});	

function svcprocmap(req, res) 
{
	handleQueryApi(req, res, "svcprocmap");
}

router.post('/v1/tophostprocs', [validateUser], tophostprocs);	

router.get('/v1/tophostprocs', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	tophostprocs(req, res);
});	

function tophostprocs(req, res) 
{
	handleQueryApi(req, res, "tophostprocs");
}

router.post('/v1/topaggrprocs', [validateUser], topaggrprocs);	

router.get('/v1/topaggrprocs', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	topaggrprocs(req, res);
});	

function topaggrprocs(req, res) 
{
	handleQueryApi(req, res, "topaggrprocs");
}

router.post('/v1/getnotifymsg', [validateUser], getnotifymsg);	

router.get('/v1/getnotifymsg', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	getnotifymsg(req, res);
});	

function getnotifymsg(req, res) 
{
	handleQueryApi(req, res, "getnotifymsg");
}

router.post('/v1/hostinfo', [validateUser], hostinfo);	

router.get('/v1/hostinfo', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	hostinfo(req, res);
});	

function hostinfo(req, res) 
{
	handleQueryApi(req, res, "hostinfo");
}

router.post('/v1/procinfo', [validateUser], procinfo);	

router.get('/v1/procinfo', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	procinfo(req, res);
});	

function procinfo(req, res) 
{
	handleQueryApi(req, res, "procinfo");
}

router.post('/v1/procstate', [validateUser], procstate);	

router.get('/v1/procstate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	procstate(req, res);
});	

function procstate(req, res) 
{
	handleQueryApi(req, res, "procstate");
}

router.post('/v1/extprocstate', [validateUser], extprocstate);	

router.get('/v1/extprocstate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	extprocstate(req, res);
});	

function extprocstate(req, res) 
{
	handleQueryApi(req, res, "extprocstate");
}


router.post('/v1/clusterstate', [validateUser], clusterstate);	

router.get('/v1/clusterstate', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	clusterstate(req, res);
});	

function clusterstate(req, res) 
{
	handleQueryApi(req, res, "clusterstate");
}

router.post('/v1/svcmeshclust', [validateUser], svcmeshclust);	

router.get('/v1/svcmeshclust', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcmeshclust(req, res);
});	

function svcmeshclust(req, res) 
{
	handleQueryApi(req, res, "svcmeshclust");
}

router.post('/v1/svcipclust', [validateUser], svcipclust);	

router.get('/v1/svcipclust', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	svcipclust(req, res);
});	

function svcipclust(req, res) 
{
	handleQueryApi(req, res, "svcipclust");
}

router.get('/v1/alerts', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	queryAlerts(req, res);
});	

router.post('/v1/alerts', [validateUser], queryAlerts);	

function queryAlerts(req, res) 
{
	handleQueryApi(req, res, "alerts");
}

router.get('/v1/alerts/ack', function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	crudAlertAck(req, res);
});	

/*
 * TODO No user validation as ack can be triggered from email or slack and since no cookie set
 * Handle proxy cookie domain change
 */
router.post('/v1/alerts/ack', crudAlertAck);	

function crudAlertAck(req, res) 
{
	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}
	
	handleCRUDapi(req, res, "alerts", NodeMsgTypes.NODE_MSG_UPDATE, JsonMsgTypes.CRUD_ALERT_JSON, req.body, false, false);
}

router.get('/v1/alertdef', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	queryAlertdef(req, res);
});	

router.post('/v1/alertdef', [validateUser], queryAlertdef);	

function queryAlertdef(req, res) 
{
	handleQueryApi(req, res, "alertdef");
}

router.post('/v1/alertdef/add', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.post('/v1/alertdef/update', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/alertdef/delete', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.body);
});

router.put('/v1/alertdef', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.put('/v1/alertdef/:adefid', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/alertdef/:adefid/disabled/:disabled', [validateUser, validateReadWriteRole], function(req, res) { 

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.params);
});

router.delete('/v1/alertdef/:adefid', [validateUser, validateReadWriteRole], function(req, res) { 

	crudAlertdef(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.params);
});

function crudAlertdef(req, res, mtype, data) 
{
	handleCRUDapi(req, res, "alertdef", mtype, JsonMsgTypes.CRUD_ALERT_JSON, data, false, false);
}


router.get('/v1/inhibits', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	queryInhibits(req, res);
});	

router.post('/v1/inhibits', [validateUser], queryInhibits);	

function queryInhibits(req, res) 
{
	handleQueryApi(req, res, "inhibits");
}

router.post('/v1/inhibits/add', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.post('/v1/inhibits/update', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/inhibits/delete', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.body);
});

router.put('/v1/inhibits', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.put('/v1/inhibits/:inhid', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/inhibits/:inhid/disabled/:disabled', [validateUser, validateReadWriteRole], function(req, res) { 

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.params);
});


router.delete('/v1/inhibits/:inhid', [validateUser, validateReadWriteRole], function(req, res) { 

	crudInhibits(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.params);
});

function crudInhibits(req, res, mtype, data) 
{
	handleCRUDapi(req, res, "inhibits", mtype, JsonMsgTypes.CRUD_ALERT_JSON, data, false, false);
}



router.get('/v1/silences', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	querySilences(req, res);
});	

router.post('/v1/silences', [validateUser], querySilences);	

function querySilences(req, res) 
{
	handleQueryApi(req, res, "silences");
}

router.post('/v1/silences/add', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.post('/v1/silences/update', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/silences/delete', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.body);
});

router.put('/v1/silences', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.put('/v1/silences/:silid', [validateUser, validateReadWriteRole], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/silences/:silid/disabled/:disabled', [validateUser, validateReadWriteRole], function(req, res) { 

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.params);
});


router.delete('/v1/silences/:silid', [validateUser, validateReadWriteRole], function(req, res) { 

	crudSilences(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.params);
});

function crudSilences(req, res, mtype, data) 
{
	handleCRUDapi(req, res, "silences", mtype, JsonMsgTypes.CRUD_ALERT_JSON, data, false, false);
}


router.get('/v1/actions', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	queryActions(req, res);
});	

router.post('/v1/actions', [validateUser], queryActions);	

function queryActions(req, res) 
{
	handleQueryApi(req, res, "actions");
}

router.post('/v1/actions/add', [validateUser, validateAdmin], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudActions(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.post('/v1/actions/update', [validateUser, validateAdmin], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudActions(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.post('/v1/actions/delete', [validateUser, validateAdmin], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudActions(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.body);
});

router.put('/v1/actions', [validateUser, validateAdmin], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudActions(req, res, NodeMsgTypes.NODE_MSG_ADD, req.body);
});

router.put('/v1/actions/:actionid', [validateUser, validateAdmin], function(req, res) { 

	if (!req.body || true === isEmptyObj(req.body)) {

		res.type('json');
		res.status(400).end(JSON.stringify({status : 'failed', error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : 'Missing JSON Payload : Empty payload not valid'}));
		return;
	}

	crudActions(req, res, NodeMsgTypes.NODE_MSG_UPDATE, req.body);
});

router.delete('/v1/actions/:actionid', [validateUser, validateAdmin], function(req, res) { 

	crudActions(req, res, NodeMsgTypes.NODE_MSG_DELETE, req.params);
});

function crudActions(req, res, mtype, data) 
{
	handleCRUDapi(req, res, "actions", mtype, JsonMsgTypes.CRUD_ALERT_JSON, data, false, false);
}



router.post('/v1/madhavalist', [validateUser], madhavalist);	

router.get('/v1/madhavalist', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	madhavalist(req, res);
});	

function madhavalist(req, res) 
{
	handleQueryApi(req, res, "madhavalist");
}


router.post('/v1/shyamastatus', [validateUser], shyamastatus);	

router.get('/v1/shyamastatus', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	shyamastatus(req, res);
});	

function shyamastatus(req, res) 
{
	handleQueryApi(req, res, "shyamastatus");
}

router.post('/v1/madhavastatus', [validateUser], madhavastatus);	

router.get('/v1/madhavastatus', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	madhavastatus(req, res);
});	

function madhavastatus(req, res) 
{
	handleQueryApi(req, res, "madhavastatus");
}


router.post('/v1/parthalist', [validateUser], parthalist);	

router.get('/v1/parthalist', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	parthalist(req, res);
});	

function parthalist(req, res) 
{
	handleQueryApi(req, res, "parthalist");
}



/*
 * Common Query Route for the main subsystems. Users need to pass a subsys JSON field
 */
router.post('/v1/querysubsys', [validateUser], querySubsys);	

router.get('/v1/querysubsys', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	querySubsys(req, res);
});	

function querySubsys(req, res) 
{
	try {
		if (typeof req.body.subsys !== 'string') {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Subsystem Query Request with missing or invalid subsys param`}));
			return;
		}

		req.body.subsys = req.body.subsys.toLowerCase();

		const			apicall = subsysToApiCall[req.body.subsys];

		if (!apicall) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Subsystem Query Request with invalid subsys param '${req.body.subsys}'`}));
			return;
		}	

		handleQueryApi(req, res, apicall);
	}
	catch (e) {
		console.error(`Query returned exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}


router.post('/v1/multiquery', [validateUser], multiquery);	

router.get('/v1/multiquery', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	multiquery(req, res);
});	

function multiquery(req, res) 
{
	try {
		if (!req.body.multiqueryarr || (false === Array.isArray(req.body.multiqueryarr)) || (req.body.multiqueryarr.length === 0)) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with missing or invalid multiqueryarr param`}));
			return;
		}

		const		qarr = req.body.multiqueryarr;
		let		tobj = {}, mincache = 15 * 60;

		if (qarr.length > 8) {
			res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : Max multi queries limited to 8 currently`}));
			return;
		}

		req.body.multiqueryarr	= [];

		for (let qobj of qarr) {
			if (safetypeof(qobj) !== 'object') {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : Not an object`}));
				return;
			}	

			if (!qobj.qname || safetypeof(qobj.qname) !== 'string') {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : qname field missing or invalid`}));
				return;
			}

			if (!qobj.qid || safetypeof(qobj.qid) !== 'string') {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : qid field not present or invalid`}));
				return;
			}

			if (qobj.qid.length >= 32) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : qid field name too long`}));
				return;
			}	

			if (tobj[qobj.qid] !== undefined) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr param : qid ${qobj.qid} repeated`}));
				return;
			}	

			tobj[qobj.qid] 		= true;

			let			apicall = NodeQueryCalls[qobj.qname.toLowerCase()];

			if (apicall === undefined || apicall.api === NodeQueryTypes.NM_MULTI_QUERY) {
				res.status(400).end(JSON.stringify({error : ErrorTypes.ERR_INVALID_REQUEST, errmsg : `Multi Query Request with invalid multiqueryarr array param type ${qobj.qname}`}));
				return;
			}

			if (apicall.mincache < mincache) {
				mincache = apicall.mincache;
			}	

			const newobj = {
				qtype 		: apicall.api,
				qid		: qobj.qid,
				filter		: qobj.filter,
				options		: qobj.options,
			};

			req.body.multiqueryarr.push(newobj);
		}	

		tobj = null;

		handleQueryApi(req, res, "multiquery", mincache);
	}
	catch (e) {
		console.error(`Query returned exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}


router.post('/v1/nodeParthaInfo', [validateUser], nodeParthaInfo);	

router.get('/v1/nodeParthaInfo', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	nodeParthaInfo(req, res);
});	

function nodeParthaInfo(req, res) 
{
	try {
		let			pararr = req.body.pararr, clusterarr = req.body.clusterarr, hostarr = req.body.hostarr;

		if (req.body.parid && Array.isArray(req.body.pararr) === false) {
			pararr = [req.body.parid];
		}

		if (req.body.cluster && Array.isArray(req.body.clusterarr) === false) {
			clusterarr = [req.body.cluster];
		}

		if (req.body.host && Array.isArray(req.body.hostarr) === false) {
			hostarr = [req.body.host];
		}

		const			shyamaHdlr = gyeetaHdlr.get_shyama_handler();

		const api_call = function()
		{
			return  new Promise((resolve, reject) => {

				try {
					let		obj = {};

					if (pararr && Array.isArray(pararr)) {
						for (let i = 0; i < pararr.length; ++i) {
							let		parid = pararr[i], partha;
							
							if (typeof parid !== 'string') {
								reject('Invalid parameter pararr : parid not a string');
								return;
							}

							if (null === parid.match(parthaRegex)) {
								reject(`Invalid parameter pararr : parid ${parid} not a valid format`);
								return;
							}

							partha = shyamaHdlr.get_partha_info(parid);

							if (!partha) {
								obj[parid] = {
									host	:	'',
									parid	:	'',
									cluster	:	'',
									madid	:	'',
								};
							}	
							else {
								obj[parid] = partha;
							}
						}	
					}
					
					if (clusterarr && Array.isArray(clusterarr) && clusterarr.length > 0) {
						const 		parmap = shyamaHdlr.get_partha_map();

						parmap.forEach((value, key) => {
							for (let cluster of clusterarr) {
								if (value.clustername_ === cluster && value.parent_madhava_) {
									if (obj[cluster] === undefined) {
										obj[cluster] = [];
									}	

									obj[cluster].push({ host : value.hostname_, parid : key, cluster : value.clustername_, madid : value.parent_madhava_.madhava_id_ });

									break;
								}
							}	
						});	
					}	

					if (hostarr && Array.isArray(hostarr) && hostarr.length > 0) {
						const 		parmap = shyamaHdlr.get_partha_map();

						for (let [key, value] of parmap) {	
							let			found;

							for (let host of hostarr) {
								if (value.hostname_ === host && value.parent_madhava_) {
									obj[host] = { host : value.hostname_, parid : key, cluster : value.clustername_, madid : value.parent_madhava_.madhava_id_ };

									found = true;
									break;
								}
							}	
						
							if (found) {
								let			o = 0;

								for (let host of hostarr) {
									if (obj[host]) {
										o++;
									}
									else {
										break;
									}	
								}	

								if (o === hostarr.length) {
									break;
								}	
							}	
						}	
					}	

					const			objstr = JSON.stringify(obj);

					resolve(objstr);
				}
				catch (e) {
					reject(`Exception caught : ${e}`);
				}	
			});	
		};	

		handleNodeLocalQuery(req, res, "nodeParthaInfo", api_call, 30);

	}
	catch (e) {
		console.error(`Query returned exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}

router.post('/v1/nodeclusterlist', [validateUser], nodeclusterlist);	

router.get('/v1/nodeclusterlist', [validateUser], function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	nodeclusterlist(req, res);
});	

function nodeclusterlist(req, res) 
{
	try {
		const			shyamaHdlr = gyeetaHdlr.get_shyama_handler();

		const api_call = function()
		{
			return  new Promise((resolve, reject) => {
				try {
					const			cluster = req.body.cluster, obj = [];

					if (cluster && cluster.length > 0 && typeof cluster === 'string') {
						const 			parmap = shyamaHdlr.get_partha_map();
						const			creg = new RegExp(cluster);
						const			cset = new Set();

						parmap.forEach((value, key) => {
							if (creg.test(value.clustername_)) {
								cset.add(value.clustername_);
							}
						});	

						for (let clstr of cset) {
							obj.push(clstr);
						}
					}	
					else {
						reject('Invalid parameter cluster : not a string');
						return;
					}	

					const			objstr = JSON.stringify(obj);

					resolve(objstr);
				}
				catch (e) {
					reject(`Exception caught : ${e}`);
				}	
			});
		};

		handleNodeLocalQuery(req, res, "nodeclusterlist", api_call, 30);
	}
	catch (e) {
		console.error(`Query returned exception ${e} : \n${e?.stack}`);

		res.status(500).end(JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `Exception caught : ${e}`}));
	}	
}


router.post('/v1/currtime', currtime);	

// No User Validation
router.get('/v1/currtime', function(req, res) {
	if (req.query) {
		req.body = req.query;
	}
	else {
		req.body = {};
	}	

	currtime(req, res);
});	

function currtime(req, res) 
{
	const			m = moment();
	
	res.status(200).end(JSON.stringify({
		time_t 		: m.unix(), 
		time 		: m.format(),
	}));
}

// No User Validation
router.get('/v1/authType', function(req, res) {
	res.status(200).end(gyconfig.authType);
});	

router.post('/v1/basicauth', checkIsBasicAuth, basicauth.handleBasicAuth);

function checkIsBasicAuth(req, res, next)
{
	if (gyconfig.authType !== 'basic') {
		res.status(404).end(JSON.stringify({status : 'failed', error : 404, errmsg : 'Basic Authentication is disabled.'}));
		return;
	}	

	next();
}


router.get('/v1/reloaduserpass', [validateUser, validateAdmin], function(req, res) {
	const			tnow = Date.now();

	if (gyconfig.authType !== 'basic') {
		res.status(404).end(JSON.stringify({status : 'failed', error : 404, errmsg : 'Basic Authentication is disabled.'}));
		return;
	}	

	if (tnow > gtlastpassword + 30 * 1000) {
		gtlastpassword = tnow;

		console.log('Reloading Basic Authentication User Passwords as reloaduserpass request seen...');

		try {
			basicauth.basicInit();

			res.status(200).end(JSON.stringify({status : 'ok', msg : 'Reloaded User Password Configuration'}));
		}
		catch(e) {
			const errmsg = `Failed to reload User Passwords due to ${e}`;

			console.error(chalk.red(errmsg));

			res.status(400).end(JSON.stringify({status : 'failed', error : 400, errmsg}));
		}	
	}
	else {
		res.status(429).end(JSON.stringify({status : 'failed', error : 429, errmsg : 'Please try again after a few seconds'}));
	}	
});	


router.get('/v1/loginuserinfo', [validateUser], function(req, res) {
	res.status(200).end(JSON.stringify({
		user 		: req.user, 
		effrole 	: req.effrole, 
		authType	: gyconfig.authType,
	}));
});	


