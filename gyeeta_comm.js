'use strict';

const 		net = require('net');
const 		assert = require('assert').strict;
const 		chalk = require('chalk');
const		{safetypeof} = require("./gyutil.js");
const 		moment = require('moment');
const		{evaluateFilter} = require("./evaluate.js");

		require('console-stamp')(console, { 
			format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
		});

const		MAX_COMM_DATA_SZ	= 16 * 1024 * 1024;
const 		NS_HDR_MAGIC		= 0x05999905;
const		NM_HDR_MAGIC		= 0x05AAAA05;
const		NS_REGISTER_REQ		= 6;
const		NM_CONNECT_CMD		= 7;
const		NS_REGISTER_RESP	= 12;
const		NM_CONNECT_RESP		= 13;
const		COMM_EVENT_NOTIFY	= 14;
const		COMM_QUERY_CMD		= 15;
const		COMM_QUERY_RESP		= 16;
const		NS_ALERT_REGISTER	= 17;

const		NOTIFY_PING_CONN	= 0xA01;
const		NOTIFY_JSON_EVENT	= 0xA02;

const JsonMsgTypes = {
	QUERY_WEB_JSON			: 1,
	CRUD_GENERIC_JSON		: 2,
	CRUD_ALERT_JSON			: 3,
};

const		RESP_WEB_JSON		= 1000;
const 		RESP_JSON_WITH_HEADER	= 1;

const		NODE_VERSION		= 0x000200;
const		NODE_VERSION_STR	= '0.2.0';
const		MIN_SHYAMA_VERSION	= 0x000200;
const		MIN_MADHAVA_VERSION	= 0x000200;
const		COMM_VERSION		= 1;
const		CLI_TYPE_REQ_RESP	= 0;

const NodeMsgTypes = {
	NODE_MSG_QUERY			: 1,
	NODE_MSG_ADD			: 2,
	NODE_MSG_UPDATE			: 3,
	NODE_MSG_DELETE			: 4,
	NODE_MSG_PING			: 5,
};	

const NodeQueryTypes = {
	NN_MIN_TYPE			: 1000,

	NS_MADHAVA_LIST			: 1001,
	NM_HOST_STATE			: 1002,
	NM_CPU_MEM			: 1003,
	NM_LISTENER_STATE		: 1004,
	NM_TOP_HOST_PROCS		: 1005,
	NM_TOP_LISTENERS		: 1006,
	NM_LISTENER_INFO		: 1007,
	NM_ACTIVE_CONN			: 1008,
	NM_LISTENER_SUMM		: 1009,
	NM_LISTENPROC_MAP		: 1010,
	NM_CLIENT_CONN			: 1011,
	NM_NOTIFY_MSG			: 1012,
	NM_HOST_INFO			: 1013,
	NM_PROC_INFO			: 1014,
	NM_PROC_STATE			: 1015,
	NM_TOP_AGGR_PROCS		: 1016,
	NM_CLUSTER_STATE		: 1017,
	NS_SVC_MESH_CLUST		: 1018,
	NS_SVC_IP_CLUST			: 1019,
	NS_ALERTS			: 1020,
	NS_ALERTDEF			: 1021,
	NS_INHIBITS			: 1022,
	NS_SILENCES			: 1023,
	NS_ACTIONS			: 1024,
	NM_EXTSVCSTATE			: 1025,
	NM_EXTACTIVECONN		: 1026,
	NM_EXTCLIENTCONN		: 1027,
	NM_EXTPROCSTATE			: 1028,
	NS_SHYAMASTATUS			: 1029,
	NM_MADHAVASTATUS		: 1030,
	NM_PARTHALIST			: 1031,

	NM_MULTI_QUERY			: 5000,
};	

const ErrorTypes = {
	ERR_SUCCESS			: 0,

	ERR_INVALID_REQUEST		: 400,
	ERR_CONFLICTS			: 409,
	ERR_DATA_NOT_FOUND		: 410,
	ERR_SERV_ERROR			: 500,
	ERR_TIMED_OUT			: 504,
	ERR_BLOCKING_ERROR		: 503,
	ERR_MAX_SZ_BREACHED		: 507,
	ERR_SYSERROR			: 510,

};	

let 		gNodeHost		= '';
let		gNodePort		= 0;

function get_align_len(nsize, nalign = 8)
{
	return ((nsize - 1) & ~(nalign - 1)) + nalign;
}	

function get_curr_sec_big(secsToAdd = 0)
{
	return BigInt((Date.now() / 1000 | 0) + secsToAdd);
}	

class GyCommError extends Error 
{
	constructor(message) 
	{
		super(message);
		this.name = this.constructor.name;
	}
};

class CommHeader
{
	static	 		structlen = 16;

	constructor(data_type, payload_len, ismad)
	{
		const 		hdr = Buffer.allocUnsafe(CommHeader.structlen);
		let 		padlen = 0, offlen = 0, padbuf = "";

		let		total_sz = CommHeader.structlen + payload_len;
		
		padlen = get_align_len(total_sz) - total_sz;
		total_sz += padlen;
			
		offlen = hdr.writeUInt32LE(ismad ? NM_HDR_MAGIC : NS_HDR_MAGIC, 0);
		offlen = hdr.writeUInt32LE(total_sz, offlen);
		offlen = hdr.writeUInt32LE(data_type, offlen);
		offlen = hdr.writeUInt32LE(padlen, offlen);
		
		if (padlen > 0) {
			padbuf = Buffer.allocUnsafe(padlen);
			
			for (let i = 0; i < padlen; ++i) {
				padbuf[i] = 0;
			}	
		}

		this.struct_ 		= hdr;
		this.padding_sz_	= padlen;
		this.data_type_		= data_type;
		this.total_sz_		= total_sz;
		this.padbuf_		= padbuf;

		CommHeader.validate(this);
	}	

	static parse_hdr(hdr, conn)
	{
		assert.equal(hdr.length, CommHeader.structlen);
		
		const			tmagic = conn.is_madhava_ ? NM_HDR_MAGIC : NS_HDR_MAGIC;
		let			obj = {};
			
		obj.magic_		= hdr.readUInt32LE(0);
		
		if (obj.magic_ != tmagic) {
			throw new GyCommError(`ERROR : Invalid Magic Type seen for Communication Header ${obj.magic_.toString(16)}`);
		}	

		obj.total_sz_		= hdr.readUInt32LE(4); 
		obj.data_type_		= hdr.readUInt32LE(8);
		obj.padding_sz_		= hdr.readUInt32LE(12);

		CommHeader.validate(obj);

		return obj;
	}	

	static validate(obj)
	{
		if (obj.total_sz_ > MAX_COMM_DATA_SZ || obj.total_sz_ <= CommHeader.structlen) {
			throw new GyCommError(`ERROR : Invalid Total Size seen for Communication Header ${obj.total_sz_}`);
		}	
		
		switch (obj.data_type_) {
		
		case COMM_QUERY_RESP :
		case COMM_QUERY_CMD :
		case COMM_EVENT_NOTIFY :
		case NM_CONNECT_CMD :
		case NM_CONNECT_RESP :
		case NS_REGISTER_REQ :
		case NS_REGISTER_RESP :
		case NS_ALERT_REGISTER :
			break;
		
		default :
			throw new GyCommError(`ERROR : Invalid Data Type seen for Communication Header ${Number(obj.data_type_).toString(16)}`);
		}

		if (obj.padding_sz_ >= 8) {
			throw new GyCommError(`ERROR : Invalid Padding Size seen for Communication Header ${obj.padding_sz_}`);
		}	
	}	
};	


class NSRegisterReq
{
	static 			structlen = 416;

	constructor()
	{
		const 		hdr = Buffer.allocUnsafe(NSRegisterReq.structlen);
		let		offlen = 0;
		
		hdr.fill(0);

		offlen = hdr.writeBigUInt64LE(get_curr_sec_big(), 0);
		offlen = hdr.writeUInt32LE(COMM_VERSION, offlen);
		offlen = hdr.writeUInt32LE(NODE_VERSION, offlen);
		offlen = hdr.writeUInt32LE(MIN_SHYAMA_VERSION, offlen);
		offlen = hdr.writeUInt32LE(CLI_TYPE_REQ_RESP, offlen);
		offlen = hdr.writeUInt32LE(gNodePort, offlen);
		hdr.write(gNodeHost, offlen);
		
		this.struct_ 		= hdr;
	}	
};	

class NMConnectCmd
{
	static 			structlen = 416;

	constructor()
	{
		const 		hdr = Buffer.allocUnsafe(NMConnectCmd.structlen);
		let		offlen = 0;
		
		hdr.fill(0);

		offlen = hdr.writeBigUInt64LE(get_curr_sec_big(), 0);
		offlen = hdr.writeUInt32LE(COMM_VERSION, offlen);
		offlen = hdr.writeUInt32LE(NODE_VERSION, offlen);
		offlen = hdr.writeUInt32LE(MIN_MADHAVA_VERSION, offlen);
		offlen = hdr.writeUInt32LE(CLI_TYPE_REQ_RESP, offlen);
		offlen = hdr.writeUInt32LE(gNodePort, offlen);
		hdr.write(gNodeHost, offlen);
		
		this.struct_ 		= hdr;
	}	
};	

class RegisterResponse
{
	static 			structlen = 424;
	
	static parse_response(resp, server_string)
	{
		if (resp.length != RegisterResponse.structlen) {
			throw new GyCommError(`ERROR : Invalid Register Response Size ${resp.length} seen for ${server_string}`);
		}	
		
		let			obj = {};

		obj.error_code_		= resp.readUInt32LE(0); 
		obj.server_version_	= resp.readUInt32LE(4);
		obj.server_id_		= resp.subarray(8, 40).toString();

		if (obj.error_code_ != 0) {
			throw new GyCommError(`ERROR : Registration to ${server_string} failed with Error Code ${obj.error_code_} : Error is ${resp.subarray(40, resp.indexOf(0, 40)).toString()}`);
		}

		return obj;
	}	
};	

class QueryCmd
{
	static 			structlen = 24;

	constructor(seqid, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		const 		hdr = Buffer.allocUnsafe(QueryCmd.structlen);
		let		offlen = 0;

		switch (jsontype) {
		
		case JsonMsgTypes.QUERY_WEB_JSON :
		case JsonMsgTypes.CRUD_GENERIC_JSON :
		case JsonMsgTypes.CRUD_ALERT_JSON :
			break;

		default :
			jsontype = JsonMsgTypes.QUERY_WEB_JSON;
			break;
		}	
		
		offlen = hdr.writeBigUInt64LE(BigInt(seqid), 0);
		offlen = hdr.writeBigUInt64LE(get_curr_sec_big(timeout_secs), offlen);
		offlen = hdr.writeUInt32LE(jsontype, offlen);
		offlen = hdr.writeUInt32LE(RESP_WEB_JSON, offlen);

		this.struct_ 		= hdr;
	}	

	static parse_req(req, server_string)
	{
		if (req.length < QueryCmd.structlen) {
			throw new GyCommError(`ERROR : Invalid Query Cmd Size ${req.length} seen for ${server_string}`);
		}	
		
		let			obj = {};

		obj.seqid_		= Number(req.readBigUInt64LE(0));
		obj.timeoutmsec_	= Number(req.readBigUInt64LE(8)) * 1000; 
		obj.query_type_		= req.readUInt32LE(16);
		obj.respformat_		= req.readUInt32LE(20);

		// console.debug(`Received Query Request from ${server_string} : ${JSON.stringify(obj)}`);

		return obj;
	}	
};	


class QueryResponse
{
	static 			structlen = 32;
	
	constructor(seqid, errcode, resplen /* subsequent payload len */, is_resp_complete = true)
	{
		const 		hdr = Buffer.allocUnsafe(QueryResponse.structlen);
		let		offlen = 0;
		
		offlen = hdr.writeBigUInt64LE(BigInt(seqid), 0);
		offlen = hdr.writeUInt32LE(RESP_WEB_JSON, offlen);
		offlen = hdr.writeUInt32LE(errcode, offlen);
		offlen = hdr.writeUInt32LE(RESP_JSON_WITH_HEADER, offlen);
		offlen = hdr.writeUInt32LE(resplen, offlen);
		offlen = hdr.writeUInt32LE(0, offlen);
		offlen = hdr.writeUInt32LE(is_resp_complete ? 1 : 0, offlen);

		this.struct_ 		= hdr;
	}	

	static parse_response(resp, server_string)
	{
		if (resp.length < QueryResponse.structlen) {
			throw new GyCommError(`ERROR : Invalid Query Response Size ${resp.length} seen for ${server_string}`);
		}	
		
		let			obj = {};

		obj.seqid_		= Number(resp.readBigUInt64LE(0));
		obj.resp_type_		= resp.readUInt32LE(8); 
		obj.respcode_		= resp.readUInt32LE(12);
		obj.respformat_		= resp.readUInt32LE(16);
		obj.resp_len_		= resp.readUInt32LE(20);
		obj.respflags_		= resp.readUInt32LE(24);
		obj.is_resp_complete_	= resp.readUInt32LE(28);

		return obj;
	}	
};	

class EventNotify
{
	static 			structlen = 8;

	constructor(notify_type, nevents = 1)
	{
		const 		hdr = Buffer.allocUnsafe(EventNotify.structlen);
		let		offlen = 0;
		
		offlen = hdr.writeUInt32LE(notify_type, 0);
		offlen = hdr.writeUInt32LE(nevents, offlen);

		this.struct_ 		= hdr;
	}	

	static parse_event(evt, server_string)
	{
		if (evt.length < EventNotify.structlen) {
			throw new GyCommError(`ERROR : Invalid Event Header Size ${evt.length} seen for ${server_string}`);
		}	
		
		let			obj = {};

		obj.notify_type_	= evt.readUInt32LE(0);
		obj.nevents_		= evt.readUInt32LE(4);

		// console.debug(`Received Event Notify from ${server_string} : ${JSON.stringify(obj)}`);

		return obj;
	}	
};	


const GyConnStates = 
{
	Disconnected	: 0,
	Connected	: 1,
	Registered	: 2,
	Exiting		: 3,
};

class ReqEventCallbacks
{
	static 		MAX_CALLBACKS	= 1024;

	constructor()
	{
		this.cbmap_ = new Map();
	}	

	set_callback(key, cb)
	{
		if (typeof key === 'string' && typeof cb === 'function' && this.cbmap_.size < ReqEventCallbacks.MAX_CALLBACKS) {
			this.cbmap_.set(key, cb);
			return true;
		}	

		return false;
	}	

	get_callback(key)
	{
		if (typeof key === 'string') {
			return this.cbmap_.get(key);
		}	

		return null;
	}	

	delete_key(key)
	{
		this.cbmap_.delete(key);
	}

	num_callbacks()
	{
		return this.cbmap_.size;
	}	
};	

const gcallbacklist = new ReqEventCallbacks();

function setReqEventCallback(key, cb)
{
	return gcallbacklist.set_callback(key, cb);
}	

setReqEventCallback('currtime', () => {
	const			m = moment();

	return {
		time_t 		: m.unix(), 
		time 		: m.format()
	};	
});	

setReqEventCallback('parsefilter', (qry) => {
	let			data = qry.data;

	if (safetypeof(data) !== 'string') {
		return '';
	}	

	if (qry.format && qry.format === 'object') {
		return evaluateFilter(data); 
	}	
	else {
		// Default is to encode the evaluateFilter output as a string. Note this is diff from a NodeMsgTypes.NODE_MSG_QUERY format
		return JSON.stringify(evaluateFilter(data)); 
	}	
});	


class RespPromise
{
	constructor(conn, seqid, timeout_secs)
	{
		// Extend Promise to prevent Garbage Collection if Map entry deleted and Promise handler not executed yet
		this.promise_ = new Promise((resolve, reject) => {
			this.resolve 	= resolve;
			this.reject 	= reject;
		});

		this.then 			= this.promise_.then.bind(this.promise_);
		this.catch 			= this.promise_.catch.bind(this.promise_);
		this[Symbol.toStringTag] 	= 'Promise';

		this.conn_			= conn;
		this.seqid_			= seqid;
		this.created_tmsec_		= Date.now();
		this.timeout_secs_		= timeout_secs;
		this.total_bytes_rcvd_		= 0;
		this.resp_buf_arr_		= [];
		this.last_resp_tmsec_		= 0;
		this.is_complete_		= false;
	}	

	push_response(resp, is_complete, respcode)
	{
		this.resp_buf_arr_.push(resp);
		this.total_bytes_rcvd_ += resp.length;
		this.last_resp_tmsec_	= Date.now();

		/*console.debug(`Received Response chunk from ${this.conn_.conn_string_} seqid ${this.seqid_} of length ${resp.length} : Total Length ${this.total_bytes_rcvd_}\n`);*/

		if (is_complete) {
			this.is_complete_ = true;
			this.resolve({respcode : respcode, data : this.resp_buf_arr_});

			console.debug(`Response received from ${this.conn_.conn_string_} seqid ${this.seqid_} : Respcode ${respcode} : Response Time is ${this.last_resp_tmsec_ - this.created_tmsec_} msec `
						+ `and length ${this.total_bytes_rcvd_} chars`);
		}	
	}	

	signal_reject(reason = 'Errored Out', respcode = ErrorTypes.ERR_SERV_ERROR)
	{
		this.is_complete_ = true;
		this.reject({respcode : respcode, data : [].push(reason)});
	}	

	handle_timeout(currmsec = Date.now(), leewaymultiple = 0.0)
	{
		if (this.created_tmsec_ + (this.timeout_secs_ + leewaymultiple * this.timeout_secs_) * 1000 < currmsec) {
			console.error(chalk.red(`Response Timed Out for query to ${this.conn_.conn_string_} seqid ${this.seqid_} : Waited ${currmsec - this.created_tmsec_} msec`));

			this.signal_reject('Response Timed Out', ErrorTypes.ERR_TIMED_OUT);
			return true;
		}
		
		return false;
	}	
};	

class GyConn
{
	static MAX_REQ_MULTIPLEX		= 1024;
	static MAX_REQ_SEQID			= Number.MAX_SAFE_INTEGER - 1000;
	static MAX_PENDING_WRITE_BYTES		= 10 * 1024 * 1024;

	constructor(server_host, server_port, is_madhava, conn_index, poolobj, to_reconnect = true, is_action_conn = false)
	{
		this.sock_		= null;
		this.sockstate_		= GyConnStates.Disconnected;
		this.server_host_	= server_host;
		this.server_port_	= server_port;
		this.is_madhava_	= is_madhava;
		this.conn_index_	= conn_index;
		this.poolobj_		= poolobj;
		this.connect_timerid_	= null;
		this.resp_map_		= new Map();
		this.to_reconnect_	= to_reconnect;
		this.is_action_conn_	= is_action_conn;

		if (is_action_conn === true && is_madhava) {
			throw new GyCommError(`Internal Error : Connection for Alert Action ${server_host} port ${server_port} specified but Conn Type set as Madhava`);
		}

		this.conn_string_	= (is_madhava ? 'Madhava' : 'Shyama');

		if (is_action_conn === true) {
			this.conn_string_ += ' Alertmgr';
		}	
		this.conn_string_  	+= ` Host ${server_host} Port ${server_port} Conn #${conn_index}`;

		this.req_seq_id_	= 0;
		this.nmap_missed_	= 0;
		this.lastsendmsec_	= 0;
		this.lasttimeoutchk_	= 0;
		this.nsends_		= 0;
		this.nbytes_rcvd_	= 0;
		this.hdr_		= {
			data_type_	: 0,
			total_sz_	: 0,
			padding_sz_	: 0,
		};	

		this.resp_data_		= null;
	}

	create_conn() {

		if (this.sockstate_ === GyConnStates.Registered) {
			return;
		}

		console.log(`Initiating Connection for ${this.conn_string_}`);
		
		if (this.connect_timerid_ !== null) {
			clearTimeout(this.connect_timerid_);
			this.connect_timerid_ = null;
		}

		this.sock_ = net.createConnection({ port: this.server_port_, host: this.server_host_, timeout: 3000 }, () => 
		{
			console.log(`Connected to ${this.conn_string_} : Now starting Registration...`);
			
			this.sockstate_		= GyConnStates.Connected;
			this.connect_timerid_	= null;
			this.sock_.this_	= this;
			
			this.sock_.removeAllListeners('timeout');
		
			try {
				if (this.is_madhava_ === true) {
					this.register_madhava();
				}
				else {
					this.register_shyama();
				}
			}
			catch (e) {
				console.error(`Caught exception while registering to server for ${this.conn_string_} : ${e}\n${e?.stack}\n`);
				this.destroy_conn();
			}	
		});

		this.sock_.once('timeout', () => {
			console.error(`Connect Timed Out while connecting to ${this.conn_string_}. Will retry later...\n`);
			
			this.sock_.destroy();

			this.connect_timerid_ = setTimeout(() => {
				this.connect_timerid_ = null;
				this.create_conn();
			}, 30 * 1000);
		})	

		this.sock_.on('readable', () => {

			do {
				let 		chunkhdr, chunkdata, chunkpad, commhdr;
				let		nbytes = 0;

				if (this.hdr_.total_sz_ === 0) {
					// First read the header
					chunkhdr = this.sock_.read(CommHeader.structlen);

					if ((null === chunkhdr) || (chunkhdr.length < CommHeader.structlen)) {
						// Non null indicates end of stream let end stream handler handle
						return;
					}

					try {
						let commhdr = CommHeader.parse_hdr(chunkhdr, this);
						
						this.hdr_.total_sz_ 	= commhdr.total_sz_;
						this.hdr_.data_type_	= commhdr.data_type_;
						this.hdr_.padding_sz_	= commhdr.padding_sz_;
					}
					catch (e) {
						console.error(`Exception caught while parsing Header for ${this.conn_string_} : ${e}\n${e?.stack}\n`);
						this.destroy_conn();
					}	
				}	
				
				const		resplen = this.hdr_.total_sz_ - CommHeader.structlen;

				chunkdata = this.sock_.read(resplen);
				
				if ((null === chunkdata) || (chunkdata.length < resplen)) {
					// Non null indicates end of stream let end stream handler handle
					return;
				}

				try {
					if (this.sockstate_ >= GyConnStates.Registered) {
						if (this.hdr_.data_type_ === COMM_QUERY_RESP) {
							this.handle_query_response(chunkdata);
						}
						else if (this.hdr_.data_type_ === COMM_EVENT_NOTIFY) {
							this.handle_notification_event(chunkdata);
						}	
						else if (this.hdr_.data_type_ === COMM_QUERY_CMD) {
							this.handle_incoming_req(chunkdata);
						}	
						else {
							// Ignore
						}	
					}
					else {
						let robj = RegisterResponse.parse_response(chunkdata, this.conn_string_);

						this.sockstate_		= GyConnStates.Registered;

						this.poolobj_.set_conn_valid(this.conn_index_, true, robj.server_id_, robj.server_version_);

						console.log(`Registered Successfully with remote ${this.conn_string_}...`);
					}	

					this.clear_data();
				}
				catch (e) {
					console.error(`Exception caught while handling data from ${this.conn_string_} : ${e}\n${e?.stack}\n`);
					this.destroy_conn();
					return;
				}	
			} while (true);
		});

		this.sock_.on('end', () => {
			if (this.sockstate_ !== GyConnStates.Exiting) { 
				console.error(`Connection disconnected from server for ${this.conn_string_}.`);
				this.destroy_conn();
			}
		});

		this.sock_.on('error', () => {
			if (this.sockstate_ !== GyConnStates.Exiting) { 
				if (this.sockstate_ !== GyConnStates.Disconnected) {
					console.error(`Error Event Occured for Connection ${this.conn_string_}... Disconnecting`);
				}
				else {
					console.info(`Failed to Connect to ${this.conn_string_}...`);
				}	
				this.destroy_conn();
			}
		});
	}

	destroy_conn(destroy_completely = false)
	{
		if (this.sockstate_ === GyConnStates.Exiting) { 

			this.sock_.removeAllListeners();

			if (destroy_completely === true) {
				if (this.connect_timerid_ !== null) {
					clearTimeout(this.connect_timerid_);
					this.connect_timerid_ = null;
				}
			}	
			return;
		}

		this.sockstate_ = GyConnStates.Exiting;
		
		this.sock_.removeAllListeners();

		this.poolobj_.set_conn_valid(this.conn_index_, false, 0, 0);

		try {
			this.sock_.destroy();
		
			console.debug(`Destroying Connection and clearing Connection Response Data Map for ${this.conn_string_}`);

			this.signal_all_reject('Response Rejected as connection is closing');

			// Schedule the map cleanup to enable promise callbacks
			setImmediate((resp_map) => { resp_map.clear(); }, this.resp_map_);

			if (this.connect_timerid_ !== null) {
				clearTimeout(this.connect_timerid_);
				this.connect_timerid_ = null;
			}
		}
		catch (e) {
			console.error(`Exception caught while destroying connection for ${this.conn_string_} : ${e}\n${e?.stack}\n`);
		}	

		this.clear_data();

		if (this.to_reconnect_ === true && destroy_completely === false) {
			this.connect_timerid_ = setTimeout(() => {
				console.log(`Initiating Connection Reconnect for ${this.conn_string_}`);
				
				this.sockstate_ = GyConnStates.Disconnected;
				this.connect_timerid_ = null;

				this.create_conn();
			}, 30 * 1000);	
		}	
		else if (destroy_completely) {
			this.poolobj_ 	= undefined;
		}	
	}	

	clear_data()
	{
		this.hdr_.total_sz_ 	= 0;
		this.hdr_.data_type_	= 0;
		this.hdr_.padding_sz_	= 0;
		this.resp_data_		= null;
	}	

	is_registered()
	{
		return (this.sockstate_ === GyConnStates.Registered);
	}

	is_write_allowed(max_pending_resp = GyConn.MAX_REQ_MULTIPLEX, max_pending_write_bytes = GyConn.MAX_PENDING_WRITE_BYTES)
	{
		return (this.sockstate_ === GyConnStates.Registered && this.resp_map_.size < max_pending_resp && this.sock_.writableLength < max_pending_write_bytes);
	}

	num_pending_responses()
	{
		return this.resp_map_.size;
	}	

	handle_query_response(resp)
	{
		let		rhdr = QueryResponse.parse_response(resp, this.conn_string_);
		
		if (rhdr.seqid_ === 0) {
			// Response to be ignored
			return;
		}	

		let		mobj = this.resp_map_.get(rhdr.seqid_);

		if (mobj === undefined) {

			console.debug(`[ERROR]: Received Response for a query with non existent sequence ${rhdr.seqid_}\n`);
			this.nmap_missed_++;
			return;
		}	
			
		let		respdata = resp.subarray(QueryResponse.structlen, resp.length - this.hdr_.padding_sz_).toString('utf8');

		if (rhdr.is_resp_complete_) {
			this.resp_map_.delete(rhdr.seqid_);
		}

		mobj.push_response(respdata, rhdr.is_resp_complete_, rhdr.respcode_);
	}	

	handle_incoming_req(req)
	{
		const			rhdr = QueryCmd.parse_req(req, this.conn_string_);
		const			seqid = rhdr.seqid_;
		let			qryresp, errcode = ErrorTypes.ERR_SUCCESS;
			
		try {
			if (rhdr.query_type_ !== JsonMsgTypes.QUERY_WEB_JSON) {

				errcode = ErrorTypes.ERR_INVALID_REQUEST;
				qryresp = JSON.stringify({error : errcode, errmsg : `Incoming Request not of Web JSON Type`});

				send_query_response(seqid, errcode, qryresp, true);

				return;
			}	

			/*
			 * We need the request to be an array of objects :
			 *
			 * Currently we support the following request types :
			 * 
			 * 1. "currtime" 	: Output is of format [{id : "c1", time_t : 1628244881, data : "2021-08-06T15:46:34+05:30"}]
			 * 2. "parsefilter" 	: Output is of format [{id : "f1", data : '{ "data": "cpumem.oom_kill > 0", "hash": "b58d62683453060c" }' }]
			 *
			 * For Errors, the output is of format : {"error" : ErrorTypes.ERR_INVALID_REQUEST, "errmsg" : "Invalid Arguments"}
			 *
			 * e.g. 
			 	[ 
			 		{type : "currtime", id : "c1" }, 
			 		{type : "parsefilter", id : "f1", format : [can be "string"/"object"], data : "( ({ percentile(0.95, resp5s) > 100 }) or ({ percentile(0.95, qps5s) > 50 }) )" }
				]	
			 *
			 * The output JSON Array is first run through a JSON.stringify() and then sent as response
			 */	

			let			query = req.subarray(QueryCmd.structlen, req.length - this.hdr_.padding_sz_).toString('utf8');

			if (query.length === 0) {
				errcode = ErrorTypes.ERR_INVALID_REQUEST;
				qryresp = JSON.stringify({error : errcode, errmsg : `Incoming Request has 0 length request`});

				send_query_response(seqid, errcode, qryresp, true);

				return;
			}

			let			pqryarr = JSON.parse(query);	

			if (safetypeof(pqryarr) !== 'array') {
				
				errcode = ErrorTypes.ERR_INVALID_REQUEST;
				qryresp = JSON.stringify({error : errcode, errmsg : `Incoming Request not of an Array Type`});

				send_query_response(seqid, errcode, qryresp, true);
				return;
			}	

			qryresp = [];

			for (let i = 0; i < pqryarr.length; ++i) {
				const			qry = pqryarr[i];

				if (safetypeof(qry) !== 'object') {
					continue;
				}	

				if (qry.type === undefined || qry.id === undefined) {
					continue;
				}	

				const			cb = gcallbacklist.get_callback(qry.type);

				if (typeof cb === 'function') {
					qryresp.push({ id : qry.id, data : cb(qry) }); 
				}	
			}	

			send_query_response(seqid, errcode, JSON.stringify({ data : qryresp }), true);
		}
		catch (e) {
			errcode = ErrorTypes.ERR_SERV_ERROR;
			qryresp = JSON.stringify({error : errcode, errmsg : `Exception caught while handling request : ${e}`});

			send_query_response(seqid, errcode, qryresp, true);

			console.debug(`[ERROR]: Exception caught while handling incoming request : ${e}\n`);
		}
	}

	handle_notification_event(evt)
	{
		const			rhdr = EventNotify.parse_event(evt, this.conn_string_);
			
		if ((rhdr.notify_type_ !== NOTIFY_JSON_EVENT) || (rhdr.nevents_ !== 1)) {
			// Not Handled : No Response to be sent
			return;
		}	

		try {
			/*
			 * We need the event payload to be an object :
			 * e.g.  { etype : "action", ...} 	// For Alert Action
			 */	

			let			notify = evt.subarray(EventNotify.structlen, evt.length - this.hdr_.padding_sz_).toString('utf8');
			let			eobj;
			
			if (notify.length === 0) {
				return;
			}	

			try {
				eobj = JSON.parse(notify);	
			}
			catch (e) {
				console.debug(`[ERROR]: Invalid JSON seen while handling incoming event notification : ${e} : Data : ${notify}\n`);
				return;
			}	

			if (safetypeof(eobj) !== 'object') {
				return;
			}	

			if (typeof eobj.etype !== 'string') {
				return;
			}	

			const			cb = gcallbacklist.get_callback(eobj.etype);

			if (typeof cb === 'function') {
				cb(eobj); 
			}	
		}
		catch (e) {
			console.debug(`[ERROR]: Exception caught while handling incoming event notification : ${e}\n`);
		}
	}

	signal_all_reject(reason)
	{
		for (let prom of this.resp_map_.values()) {
			if (!prom.is_complete_) { 
				prom.signal_reject(reason);
			}
		}
	}	

	// Internal API call
	get_resp_promise(timeout_sec)
	{
		if (this.resp_map_.size > GyConn.MAX_REQ_MULTIPLEX) {
			throw new GyCommError(`ERROR : Too Many Multiplexed Responses pending for ${this.conn_string_} : ${this.resp_map_.size}`);
		}

		this.req_seq_id_++;

		if (this.req_seq_id_ > GyConn.MAX_REQ_SEQID) {
			this.req_seq_id_ = 1;
		}	

		const 		prom = new RespPromise(this, this.req_seq_id_, timeout_sec);
		
		this.resp_map_.set(this.req_seq_id_, prom);
		
		return prom;
	}


	/*
	 * Users need to call this API specifying the query string in a JSON format within query_string
	 * resp_promise if true, will cause a promise to be allocated for the response handling, else
	 * no response parsing will be done for this query.
	 * timeout_secs is the max number of seconds to wait for this response in seconds.
	 *
	 * Returns a promise. If resp_promise is false will return a dummy Resolved Promise of null array.
	 */
	send_query(query_string, resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		let		prom = null;
		let		qseqid = 0;
		let		nullbyte;
		
		if ((typeof query_string !== 'string') && (false === Buffer.isBuffer(query_string))) {
			throw new GyCommError(`Internal Error : send_query called with not supported type : ${typeof query_string} for ${this.conn_string_}`);
		}	

		if (resp_promise === true) {
			prom = this.get_resp_promise(timeout_secs);
			qseqid = prom.seqid_;
		}	

		// Need to terminate query string with '\0'
		if (query_string.length > 0) {
			nullbyte = '\x00';
		}	
		else {
			nullbyte = '';
		}	

		this.send_buffers(COMM_QUERY_CMD, (new QueryCmd(qseqid, timeout_secs, jsontype)).struct_, query_string, nullbyte);

		if (resp_promise === true) {
			return prom;
		}
		
		return Promise.resolve([]);
	}

	send_event_notify(notify_type, notify_string = '', nevents = 1)
	{
		if ((typeof notify_string !== 'string') && (false === Buffer.isBuffer(notify_string))) {
			throw new GyCommError(`Internal Error : send_event_notify called with not supported type : ${typeof notify_string} for ${this.conn_string_}`);
		}	

		let		nullbyte;

		// Need to terminate notify_string with '\0'
		if (notify_string.length > 0) {
			nullbyte = '\x00';
		}	
		else {
			nullbyte = '';
		}	

		this.send_buffers(COMM_EVENT_NOTIFY, (new EventNotify(notify_type, nevents)).struct_, notify_string, nullbyte);
	}

	send_query_response(seqid, errcode, qryresp, is_resp_complete = true)
	{
		if ((typeof qryresp !== 'string') && (false === Buffer.isBuffer(qryresp))) {
			throw new GyCommError(`Internal Error : send_query_response called with not supported type : ${typeof qryresp} for ${this.conn_string_}`);
		}	

		let		nullbyte, resp_length;

		// Need to terminate qryresp with '\0'
		if (qryresp.length > 0) {
			resp_length = qryresp.length + 1;
			nullbyte = '\x00';
		}	
		else {
			resp_length = 0;
			nullbyte = '';
		}	

		this.send_buffers(COMM_QUERY_RESP, (new QueryResponse(seqid, errcode, resp_length, is_resp_complete)).struct_, qryresp, nullbyte);
	}

	// Internal api. Params include data_type and Comm Headers excluding CommHeader and subsequent data as Buffers 
	send_buffers(data_type)
	{
		if (arguments.length < 2) {
			throw new GyCommError(`Internal Error : Inadequate number of params to send_buffers() for ${this.conn_string_}`); 
		}

		let		payloadlen = 0;

		for (let i = 1; i < arguments.length; ++i) {
			payloadlen += Buffer.byteLength(arguments[i], 'utf8');
		}

		let commhdr = new CommHeader(data_type, payloadlen, this.is_madhava_);
		
		this.sock_.cork();
		this.sock_.write(commhdr.struct_);

		for (let i = 1; i < arguments.length; ++i) {
			this.sock_.write(arguments[i]);
		}

		if (commhdr.padding_sz_ > 0) {
			this.sock_.write(commhdr.padbuf_);
		}

		this.sock_.uncork();	// We do not uncork at nextTick since we need to use the conn for multiplexing

		this.nsends_++;
		this.lastsendmsec_ = Date.now();

		/*console.debug(`Sent Message #${this.nsends_} of total length ${commhdr.total_sz_} to ${this.conn_string_}`);*/

		return true;
	}	

	ping_and_check(currmsec = Date.now())
	{
		if (currmsec > this.lastsendmsec_ + 300 * 1000) {
			this.send_event_notify(NOTIFY_PING_CONN);
		}	
	}

	check_resp_timeouts(currmsec = Date.now())
	{
		if (currmsec > this.lasttimeoutchk_ + 300 * 1000) {
			this.lasttimeoutchk_ = currmsec;

			for (let prom of this.resp_map_.values()) {

				if (true === prom.handle_timeout(currmsec, 5)) { 
					this.resp_map_.delete(prom.seqid_);
				}
			}
		}	
	}

	register_shyama(conn)
	{
		console.log(`Sending Shyama Registration Request for ${this.conn_string_}`);

		let nsreg = new NSRegisterReq();
		
		return this.send_buffers(this.is_action_conn_ === true ? NS_ALERT_REGISTER : NS_REGISTER_REQ, nsreg.struct_);
	}	

	register_madhava(conn)
	{
		console.log(`Sending Madhava Registration Request for ${this.conn_string_}`);

		let nmreg = new NMConnectCmd();
		
		return this.send_buffers(NM_CONNECT_CMD, nmreg.struct_);
	}	
};	


class GyConnPool
{
	static			MAX_POOL_CONNS		= 64;
	
	constructor(server_host, server_port, is_madhava, num_conns, is_action_conn = false)
	{
		if (num_conns > GyConnPool.MAX_POOL_CONNS) {
			throw new GyCommError(`Internal Error : Connection Pool for ${server_host} port ${server_port} invalid # connections specified ${num_conns}`);
		}

		this.pool_		= [];
		this.connvalid_		= [];
		this.server_host_	= server_host;
		this.server_port_	= server_port;
		this.is_madhava_	= is_madhava;
		this.num_conns_		= num_conns;
		this.is_action_conn_	= is_action_conn;

		if (is_action_conn === true && is_madhava) {
			throw new GyCommError(`Internal Error : Connection Pool for Alert Action ${server_host} port ${server_port} specified but Conn Type set as Madhava`);
		}

		this.pool_string_	= (is_madhava ? 'Madhava' : 'Shyama');
		if (is_action_conn === true) {
			this.pool_string_ += ' Alertmgr';
		}	
		this.pool_string_  	+= ` Connection Pool for Host ${server_host} Port ${server_port} #Conns ${this.num_conns_}`;

		this.server_id_		= 0;
		this.server_version_	= 0;
		this.last_conn_index_	= 0;
		this.nrejected_qrys_	= 0;
		this.pool_created_	= false;

		for (let i = 0; i < this.num_conns_; ++i) {
			this.pool_[i] = new GyConn(this.server_host_, this.server_port_, this.is_madhava_, i, this, true /* to_reconnect */, this.is_action_conn_);

			this.connvalid_[i] = false;
		}	

		console.log(`Constructed Connection Pool for ${this.pool_string_}`);
	}	

	create_pool()
	{
		if (this.pool_created_ === true) {
			return;
		}

		console.log(`Starting Connection Pool Connects for ${this.pool_string_}`);

		let			i;

		for (i = 0; i < this.num_conns_; ++i) {
			this.pool_[i].create_conn();
		}	

		this.pool_created_ = true;
	}	

	destroy_pool()
	{
		if (this.pool_created_ === false) {
			return;
		}

		let			i;

		for (i = 0; i < this.num_conns_; ++i) {
			this.pool_[i].destroy_conn(true /* destroy_completely */);
		}	

		this.pool_created_ = false;

		console.log(`Destroyed Connection Pool ${this.pool_string_}`);
	}	

	/*
	 * Users need to call this API specifying the query string in a JSON format within query_string
	 * get_resp_promise if true, will cause a promise to be allocated for the response handling, else
	 * no response parsing will be done for this query.
	 * timeout_secs is the max number of seconds to wait for this response in seconds.
	 *
	 * Will return the response promise object if get_resp_promise is true and null otherwise
	 */
	send_query(query_string, get_resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		let			i;
		
		if (this.last_conn_index_ >= this.num_conns_) {
			this.last_conn_index_ = 0;
		}

		/*
		 * First try to get the conn with at most 5 multiplexed requests and at most 32 KB max Pending Write bytes
		 */
		for (i = this.last_conn_index_ + 1; i < this.num_conns_; ++i) {
			if (this.pool_[i].is_write_allowed(5, 32 * 1024)) {

				this.last_conn_index_ = i;
				return this.pool_[i].send_query(query_string, get_resp_promise, timeout_secs, jsontype);
			}	
		}	

		for (i = 0; i <= this.last_conn_index_; ++i) {
			if (this.pool_[i].is_write_allowed(5, 32 * 1024)) {

				this.last_conn_index_ = i;
				return this.pool_[i].send_query(query_string, get_resp_promise, timeout_secs, jsontype);
			}	
		}	

		// Now try with max limits

		for (i = this.last_conn_index_ + 1; i < this.num_conns_; ++i) {
			if (this.pool_[i].is_write_allowed()) {

				this.last_conn_index_ = i;
				return this.pool_[i].send_query(query_string, get_resp_promise, timeout_secs, jsontype);
			}	
		}	

		for (i = 0; i <= this.last_conn_index_; ++i) {
			if (this.pool_[i].is_write_allowed()) {

				this.last_conn_index_ = i;
				return this.pool_[i].send_query(query_string, get_resp_promise, timeout_secs, jsontype);
			}	
		}	

		this.nrejected_qrys_++;

		for (i = 0; i < this.num_conns_; ++i) {
			if (this.connvalid_[i] === true) {
				break;
			}	
		}	

		if (i === this.num_conns_) {
			throw new GyCommError(`ERROR : No Valid Connections exist for Pool ${this.pool_string_}. Please retry later`);
		}	

		throw new GyCommError(`ERROR : All the connections are overloaded with queries for ${this.pool_string_}. Please retry later`);
	}

	set_conn_valid(conn_index, is_registered, server_id, server_version)
	{
		if (conn_index >= 0 && conn_index < this.num_conns_) {
			this.connvalid_[conn_index] = Boolean(is_registered);

			if (is_registered === true) {
				this.server_id_ 	= server_id;
				this.server_version_	= server_version;

				console.log(`Registered successfully for ${this.pool_string_} : Server ID is ${this.server_id_} : Version is 0x${this.server_version_.toString(16)}`);
			}	
		}	
	}	

	is_conn_available()
	{
		for (let i = 0; i < this.num_conns_; ++i) {
			if (this.connvalid_[i] === true) {
				return true;
			}	
		}	
		
		return false;
	}	

	send_pings()
	{
		const		currmsec = Date.now();

		for (let i = 0; i < this.num_conns_; ++i) {
			if (this.connvalid_[i] === true) {
				this.pool_[i].ping_and_check(currmsec);
			}
		}
	}	

	check_resp_timeouts()
	{
		const		currmsec = Date.now();

		for (let i = 0; i < this.num_conns_; ++i) {
			if (this.connvalid_[i] === true) {
				this.pool_[i].check_resp_timeouts(currmsec);
			}
		}
	}	

};	

class ParthaHost
{
	constructor(parthaid, hostname, parent_madhava, clustername)
	{
		this.parthaid_			= parthaid;
		this.hostname_			= hostname;
		this.parent_madhava_		= parent_madhava;
		this.clustername_		= clustername;

		this.lastpingmsec_		= Date.now();
	}	

	destroy()
	{
		this.parent_madhava_		= undefined;
	}	
};	

class MadhavaHandler
{
	constructor(madhavaID, madhavaHost, madhavaPort, num_conns, shyamaHandler) 
	{
		this.madhava_id_		= madhavaID;
		this.madhava_host_		= madhavaHost;
		this.madhava_port_		= madhavaPort;
		this.num_conns_			= num_conns;
		this.shyama_handler_		= shyamaHandler;
		this.server_string_  		= `Madhava Handler for Host ${this.madhava_host_} Port ${this.madhava_port_} ID ${this.madhava_id_}`;
		this.lastchgmsec_		= 0;
		this.compquerymsec_		= 0;
		this.nxt_send_query_list_	= false;
		this.lastpingmsec_		= Date.now();
		this.madhava_pool_		= new GyConnPool(this.madhava_host_, this.madhava_port_, true /* is_madhava */, this.num_conns_);

		this.madhava_pool_.create_pool();

		this.timerid_  			= setInterval(async () => {
			try {
				let 		pingq, qry;
				
				if (true === this.is_conn_available()) {
					this.madhava_pool_.check_resp_timeouts();

					const			currmsec = Date.now();

					if (currmsec - this.compquerymsec_ > 10 * 60 * 1000) {
						this.lastchgmsec_ 	= 0;
						this.compquerymsec_ 	= currmsec;
					}

					pingq = { 
						mtype 		: NodeMsgTypes.NODE_MSG_PING, 
						nodetime 	: currmsec, 
						lastchgmsec 	: this.lastchgmsec_
					};

					let		presp = await this.send_query(JSON.stringify(pingq), true, 30);
					let		prespobj;
					
					if (presp && presp.data) {
						prespobj = JSON.parse(presp.data);
					}

					if ((prespobj && Number(prespobj.lastchgmsec) > this.lastchgmsec_) || (this.nxt_send_query_list_)) {
						qry = { 
							mtype 	: NodeMsgTypes.NODE_MSG_QUERY, 
							qtype 	: NodeQueryTypes.NM_HOST_STATE,
							options	: {
								minchgmsec : this.lastchgmsec_ > 0 ? this.lastchgmsec_ - 60 * 1000 : 0
							}	
						};
					
						let 		qresp = await this.send_query(JSON.stringify(qry), true, 30);

						if (qresp && qresp.data) {
							let		qrespobj = JSON.parse(qresp.data);

							this.handle_partha_list(qrespobj);
						}
	
						if (this.lastchgmsec_ > 0) {
							if (this.nxt_send_query_list_ === true) {
								this.nxt_send_query_list_ = false;
							}
							else {
								this.nxt_send_query_list_ = true;
							}	
						}	
					}

					this.madhava_pool_.send_pings();
				}
				else {
					console.log(`No Connections exist for ${this.server_string_}. Will query for status later...`);
				}	
			}
			catch (e) {
				console.error(chalk.red(`Exception caught while querying Madhava server ${this.server_string_} to get List of Parthas : ${e}. Will try later...`));
				if (e !== undefined) {
					console.error(e?.stack);
				}	
			}
		}, 60 * 1000);
	}	
	
	destroy()
	{
		clearInterval(this.timerid_);
		this.madhava_pool_.destroy_pool();
		this.shyama_handler_ = null;
	}	

	/*
	 * Returns a promise.
	 * On success, the output will be in [string1, string2] format
	 * The strings within the response are part of the same response but will be split in case of larger responses.
	 */
	send_query(query_string, get_resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		return this.madhava_pool_.send_query(query_string, get_resp_promise, timeout_secs, jsontype);
	}	

	is_conn_available()
	{
		return this.madhava_pool_.is_conn_available();
	}	

	handle_partha_list(resp)
	{
		if (resp.nmad === 0) {
			this.lastchgmsec_ = 0;
			return;
		}

		if (false === Array.isArray(resp.hoststate)) {
			return;
		}	
		
		if (!this.shyama_handler_) {
			this.lastchgmsec_ = Number(resp.lastchgmsec);
			return;
		}	

		const		partha_hmap = this.shyama_handler_.partha_hmap_;
		const		currmsec = Date.now();
		const		updmsec = (this.lastchgmsec_ === 0);

		for (let i = 0; i < resp.hoststate.length; ++i) {
			let		partha = resp.hoststate[i];

			if (!partha.parid || !partha.host) {
				continue;
			}

			let		mpartha = partha_hmap.get(partha.parid);

			if (mpartha !== undefined) {

				if (mpartha.hostname_ === partha.host && mpartha.parent_madhava_ === this && mpartha.clustername_ === partha.cluster) { 
					if (updmsec) {
						mpartha.lastpingmsec_ = currmsec;
					}

					continue;
				}
				
				console.info(chalk.blue(`Handler for ${this.server_string_} : Change in Partha : ID ${partha.parid} Host ${partha.host} Cluster ${partha.cluster}`));
			}	
			else {
				console.info(chalk.blue(`Handler for ${this.server_string_} : Adding new Partha : ID ${partha.parid} Host ${partha.host} Cluster ${partha.cluster}`));
			}

			partha_hmap.set(partha.parid, new ParthaHost(partha.parid, partha.host, this, partha.cluster));
		}	

		this.lastchgmsec_ = Number(resp.lastchgmsec);
	}	
};	

class ShyamaHandler 
{
	constructor(shyamaHost, shyamaPort, num_conns, is_action_conn, gyeetaHandler) 
	{
		this.shyama_host_		= shyamaHost;
		this.shyama_port_		= shyamaPort;
		this.num_conns_			= num_conns;
		this.is_action_conn_		= is_action_conn;
		this.gyeeta_handler_		= gyeetaHandler;
		this.madhava_map_		= new Map();
		this.partha_hmap_		= new Map();
		this.server_string_  		= `Shyama ${is_action_conn === true ? 'Alertmgr ' : ''}Handler for Host ${this.shyama_host_} Port ${this.shyama_port_}`;
		this.nxt_send_query_list_	= false;
		this.lastchgmsec_		= 0;
		this.compquerymsec_		= 0;
		this.madcheckmsec_		= 0;
		this.parcheckmsec_		= 0;
		this.lastpingmsec_		= 0;
		this.shyama_pool_		= new GyConnPool(this.shyama_host_, this.shyama_port_, false /* is_madhava */, this.num_conns_, this.is_action_conn_);
		this.shyama_pool_.create_pool();
		this.timerid_			= null;

		if (this.is_action_conn_ === false) {
			this.timerid_ 		= setInterval(async () => {
		
				try {
					let 		pingq, qry;
					
					if (true === this.is_shyama_conn_available()) {
						this.shyama_pool_.check_resp_timeouts();

						const			currmsec = Date.now();

						if (currmsec - this.compquerymsec_ > 5 * 60 * 1000) {
							this.lastchgmsec_ 	= 0;
							this.compquerymsec_ 	= currmsec;
						}

						pingq = { 
							mtype 		: NodeMsgTypes.NODE_MSG_PING, 
							nodetime 	: currmsec, 
							lastchgmsec 	: this.lastchgmsec_
						};

						let		presp = await this.send_shyama_query(JSON.stringify(pingq), true, 30);
						let		prespobj;
						
						if (presp && presp.data) {
							prespobj = JSON.parse(presp.data);
						}

						if ((prespobj && Number(prespobj.lastchgmsec) > this.lastchgmsec_) || (this.nxt_send_query_list_)) {
							qry = { 
								mtype 	: NodeMsgTypes.NODE_MSG_QUERY, 
								qtype 	: NodeQueryTypes.NS_MADHAVA_LIST,
								options : {
									minchgmsec 	: this.lastchgmsec_ > 0 ? this.lastchgmsec_ - 60 * 1000 : 0,
									nodefields	: true,
								}	
							};

							const		minchgmsec = qry.options.minchgmsec;

							let 		qresp = await this.send_shyama_query(JSON.stringify(qry), true, 30);

							if (qresp && qresp.data) {
								let		qrespobj = JSON.parse(qresp.data);

								this.handle_madhava_list(qrespobj, minchgmsec);
							}

							if (this.lastchgmsec_ > 0) {
								if (this.nxt_send_query_list_ === true) {
									this.nxt_send_query_list_ = false;
								}
								else {
									this.nxt_send_query_list_ = true;
								}	
							}	
						}

						this.shyama_pool_.send_pings();
					}
					else {
						console.log(`No Connections exist for ${this.server_string_}. Will query for status later...`);
					}	
				}
				catch (e) {
					console.error(chalk.red(`Exception caught while querying Shyama server ${this.server_string_} to get List of Madhavas : ${e} : Will try later...`));
					if (e !== undefined) {
						console.error(e?.stack);
					}	
				}
			}, 30 * 1000);
		}
		else {
			this.timerid_ = setInterval(async () => {
		
				try {
					if (true === this.is_shyama_conn_available()) {
						this.shyama_pool_.check_resp_timeouts();
						this.shyama_pool_.send_pings();
					}
					else {
						console.log(`No Connections exist for ${this.server_string_}`);
					}	
				}
				catch (e) {
					console.error(chalk.red(`Exception caught while pinging Shyama server ${this.server_string_} : ${e} : Will try later...`));
					if (e !== undefined) {
						console.error(e?.stack);
					}	
				}
			}, 30 * 1000);
		}	
	}	
	
	destroy()
	{
		if (this.timerid_) {
			clearInterval(this.timerid_);
		}

		this.shyama_pool_.destroy_pool();

		for (let partha  of this.partha_hmap_.values()) {
			partha.destroy();
		}

		for (let madhava of this.madhava_map_.values()) {
			madhava.destroy();
		}

		this.partha_hmap_.clear();
		this.madhava_map_.clear();

		this.gyeeta_handler_ = null;
	}	

	get_madhava_from_parthaid(partha_id) 
	{
		if (!this.gyeeta_handler_) {
			throw new GyCommError(`Shyama Handler has been destroyed which may be due to a Shyama failover...`);
		}	

		let			partha = this.partha_hmap_.get(partha_id);
		
		if (partha === undefined) {
			throw new GyCommError(`Invalid Partha ID ${partha_id} or not yet updated Partha seen`);
		}	

		return partha.parent_madhava_;
	}	

	get_madhava_from_madhavaid(madhava_id) 
	{
		if (!this.gyeeta_handler_) {
			throw new GyCommError(`Shyama Handler has been destroyed which may be due to a Shyama failover...`);
		}	

		let			madhava = this.madhava_map_.get(madhava_id);
		
		if (madhava === undefined) {
			throw new GyCommError(`Invalid Madhava ID ${madhava_id} specified`);
		}	

		return madhava;
	}	

	get_partha_info(partha_id) 
	{
		if (!this.gyeeta_handler_) {
			throw new GyCommError(`Shyama Handler has been destroyed which may be due to a Shyama failover...`);
		}	

		let			partha = this.partha_hmap_.get(partha_id);
		
		if (partha === undefined || partha.parent_madhava_ === undefined) {
			return null;
		}	

		return { host : partha.hostname_, parid : partha_id, cluster : partha.clustername_, madid : partha.parent_madhava_.madhava_id_ };
	}

	get_partha_map()
	{
		return this.partha_hmap_;
	}	

	/*
	 * Returns a promise.
	 * On success, the output will be in [string1, string2] format
	 * The strings within the response are part of the same response but will be split in case of larger responses.
	 *
	 * get_resp_promise should be false ONLY if you don't care about the results and don't want to wait for them either.
	 */
	send_shyama_query(query_string, get_resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		if (!this.gyeeta_handler_) {
			return Promise.reject('Shyama Handler has been destroyed which may be due to a Shyama failover...');
		}	

		return this.shyama_pool_.send_query(query_string, get_resp_promise, timeout_secs, jsontype);
	}	

	/*
	 * Send query to All Madhava's. Returns a promise.
	 *
	 * Will return [result1, result2...] where result1, result2, etc. represent results of each Madhava server
	 *
	 * If fail_on_error === true, will error out if 1 or more Madhava queries failed.
	 * else if fail_on_error === false, will return only successful Madhava results
	 *
	 * Individual results will be in [string1, string2] format
	 * The strings within the response are part of the same response but will be split in case of larger responses.
	 *
	 * get_resp_promise should be false ONLY if you don't care about the results and don't want to wait for them either.
	 *
	 * Specific Madhava's can be targetted by specifying madfilterarr
	 */
	send_all_madhava_query(query_string, get_resp_promise = true, timeout_secs = 100, madfilterarr = [], fail_on_error = true, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		if (!this.gyeeta_handler_) {
			return Promise.reject('Shyama Handler has been destroyed which may be due to a Shyama failover...');
		}	

		let		jobs = [];

		if (!madfilterarr || (Array.isArray(madfilterarr) === false) || (0 === madfilterarr.length)) {
			for (let madhava of this.madhava_map_.values()) {
				if (madhava.is_conn_available()) {
					jobs.push(madhava.send_query(query_string, get_resp_promise, timeout_secs, jsontype));
				}
			}
		}
		else {
			for (let i = 0; i < madfilterarr.length; ++i) {
				let 		madhava;

				madhava = this.madhava_map_.get(madfilterarr[i]);

				if (madhava && madhava.is_conn_available()) {
					jobs.push(madhava.send_query(query_string, get_resp_promise, timeout_secs, jsontype));
				}	
			}	
		}	

		if (jobs.length === 0) {
			return Promise.reject('No Valid Madhava servers exist or no connections available');
		}

		if (fail_on_error === true) {
			return Promise.all(jobs);
		}
		else {
			return new Promise((resolve, reject) => {

				return Promise.allSettled(jobs)
					.then(data => {
						if (Array.isArray(data)) {
							let			resarr = [];
							
							for (let i = 0; i < data.length; ++i) {
								if (data[i].status === 'fulfilled') {
									resarr.push(data[i].value);
								}
							}

							resolve(resarr);
						}
						else {
							reject('Response Promise.allSettled did not return the data in the format needed');
						}	
					})
					.catch((error) => {
						reject(error); 
					});
			});	
		}	
	}	

	/*
	 * Returns a promise.
	 * On success, the output will be in [string1, string2] format
	 * The strings within the response are part of the same response but will be split in case of larger responses.
	 *
	 * get_resp_promise should be false ONLY if you don't care about the results and don't want to wait for them either.
	 */
	send_madhava_query(query_string, madhava, get_resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		if (!this.gyeeta_handler_) {
			return Promise.reject('Shyama Handler has been destroyed which may be due to a Shyama failover...');
		}	

		if (false === madhava instanceof MadhavaHandler) {
			throw new GyCommError(`Invalid Param specified for sending query to madhava : Not a valid Madhava Handler`);
		}	

		if (madhava.shyama_handler_ !== this) {
			return Promise.reject('Madhava specified for sending query has been reset : Not a valid Madhava Handler any more probably due to a failover');
		}	
		
		return madhava.send_query(query_string, get_resp_promise, timeout_secs, jsontype);
	}

	/*
	 * Returns a promise.
	 * On success, the output will be in [string1, string2] format
	 * The strings within the response are part of the same response but will be split in case of larger responses.
	 *
	 * get_resp_promise should be false ONLY if you don't care about the results and don't want to wait for them either.
	 */
	send_partha_related_query(query_string, partha_id, get_resp_promise = true, timeout_secs = 100, jsontype = JsonMsgTypes.QUERY_WEB_JSON)
	{
		if (!this.gyeeta_handler_) {
			return Promise.reject('Shyama Handler has been destroyed which may be due to a Shyama failover...');
		}	

		let		madhava;

		try {
			madhava = this.get_madhava_from_parthaid(partha_id);
		}
		catch (e) {
			return Promise.reject(e);
		}	

		return madhava.send_query(query_string, get_resp_promise, timeout_secs, jsontype);
	}

	is_shyama_conn_available()
	{
		return this.shyama_pool_.is_conn_available();
	}	

	handle_madhava_list(resp, minchgmsec)
	{
		if (true === this.is_action_conn_) {
			return;
		}

		if (resp.nmad === 0) {
			this.lastchgmsec_ = Number(resp.lastchgmsec);

			if (this.madhava_map_.size > 0) {
				if (minchgmsec > 0) {
					this.lastchgmsec_ = 0;
					return;
				}	
				console.info(chalk.yellow(`${this.server_string_} returned an empty Madhava List. Deleting all existing Madhavas and Partha info`));
				this.lastchgmsec_ = 0;
			}	

			for (let partha of this.partha_hmap_.values()) {
				partha.destroy();
			}

			for (let madhava of this.madhava_map_.values()) {
				madhava.destroy();
			}

			this.partha_hmap_.clear();
			this.madhava_map_.clear();

			return;
		}

		if (false === Array.isArray(resp.madhavalist)) {
			return;
		}

		const		currmsec = Date.now();
		const		updmsec = (this.lastchgmsec_ === 0);

		if (this.gyeeta_handler_) {
			for (let i = 0; i < resp.madhavalist.length; ++i) {
				let		madhava = resp.madhavalist[i];

				if (madhava.npartha === 0) {
					continue;
				}

				let		mm = this.madhava_map_.get(madhava.madid);

				if (mm !== undefined) {

					if ((mm.madhava_port_ !== madhava.port) || (mm.madhava_host_ !== madhava.host)) {
						console.info(chalk.red(`Handler for ${this.server_string_} : new Madhava Master seen with different host and port for ID ${madhava.madid} : `
								+ `Destroying older Madhava instance Host ${mm.madhava_host_} Port ${mm.madhava_port_}`));

						mm.destroy();
						
						this.madhava_map_.delete(madhava.madid);
					}
					else {
						if (updmsec) {
							mm.lastpingmsec_ = currmsec;
						}

						continue;
					}
				}	
				
				console.info(chalk.blue(`Handler for ${this.server_string_} : Adding new Madhava Server : ID ${madhava.madid} Host ${madhava.host} Port ${madhava.port} `
								+ `handling ${madhava.npartha} Parthas`));

				this.madhava_map_.set(madhava.madid, new MadhavaHandler(madhava.madid, madhava.host, madhava.port, this.num_conns_, this));
			}	
		}

		if (updmsec && currmsec - this.parcheckmsec_ > 2 * 60 * 60 * 1000) {
			let			minmsec = currmsec - 5 * 24 * 3600 * 1000;

			if (this.partha_hmap_.size > 100000) {
				minmsec = currmsec - 24 * 3600 * 1000;
			}

			this.parcheckmsec_	= currmsec;

			// Check for non-updated partha's in last 5 days
			for (let partha of this.partha_hmap_.values()) {

				if (partha.lastpingmsec_ < minmsec) {
					console.info(chalk.red(`Deleting Partha ID ${partha.parthaid_} Host ${partha.hostname_} Cluster ${partha.clustername_} `
							+ `as has not been updated since a few days time`));

					this.partha_hmap_.delete(partha.parthaid_);
				}	
			}	
		}	

		if (updmsec && currmsec - this.madcheckmsec_ > 2 * 60 * 60 * 1000) {
			let			minmsec = currmsec - 5 * 24 * 3600 * 1000;

			if (this.madhava_map_.size > 10000) {
				minmsec = currmsec - 24 * 3600 * 1000;
			}

			this.madcheckmsec_	= currmsec;

			// Check for non-updated madhava's in last 5 days
			for (let madhava of this.madhava_map_.values()) {

				if (madhava.lastpingmsec_ < minmsec) {
					console.info(chalk.red(`Deleting Madhava ID ${madhava.madhava_id_} Host ${madhava.madhava_host_} Port ${madhava.madhava_port_} `
							+ `as has not been updated since a few days time`));

					madhava.destroy();
					this.madhava_map_.delete(madhava.madhava_id_);
				}	
			}	
		}	

		this.lastchgmsec_ = Number(resp.lastchgmsec);
	}	

};	


class GyeetaHandler
{
	constructor(shyamaHostArr, shyamaPortArr, node_host, node_port, num_conns = 8, is_action_conn = false) 
	{
		if (!Array.isArray(shyamaHostArr) || !Array.isArray(shyamaPortArr)) {
			throw new GyCommError(`Invalid Shyama Host or Port specified : Not of Array type`);

		}

		if (shyamaPortArr.length != shyamaHostArr.length) {
			throw new GyCommError(`Invalid Shyama Host and Port array lengths specified`);
		}
		else if (shyamaHostArr.length === 0) {
			throw new GyCommError(`Empty Shyama Host array specified`);
		}	

		this.shyama_host_arr_		= shyamaHostArr;
		this.shyama_port_arr_		= shyamaPortArr;
		this.curr_shyama_index_		= 0;

		this.num_conns_			= num_conns;
		this.is_action_conn_		= is_action_conn;

		this.shyama_handler_		= null
		this.timerid_			= null;
		this.last_shyama_conn_		= Date.now();
		this.nshyama_changes_		= 0;
		this.isfirst_			= true;

		if (typeof node_host !== 'string') {
			throw new GyCommError(`Invalid Node Hostname specified : Not of string type`);
		}	

		gNodeHost			= node_host.slice(0, 254);
		gNodePort			= Number(node_port);

		if (gNodeHost.length === 0) {
			throw new GyCommError(`Invalid Node Hostname specified (of 0 length)`);
		}

		if (isNaN(gNodePort)) {
			throw new GyCommError(`Invalid Node Listen Port specified ${node_port}`);
		}

		this.shyama_handler_ = new ShyamaHandler(shyamaHostArr[0], shyamaPortArr[0], num_conns, is_action_conn, this);

		if (shyamaHostArr.length > 1) {
			this.timerid_ 		= setInterval(() => {
				
				try {
					this.check_shyama_failover();
				}
				catch (e) {
					console.error(`Exception caught while checking Shyama Failover : ${e}\n${e?.stack}\n`);
				}	
			}, 60 * 1000);
		}

		console.info(chalk.cyan(`Initialized Gyeeta Connection Handler : #Shyama configured is ${shyamaPortArr.length}`));
	}	
	
	destroy_handler()
	{
		if (this.timerid_) {
			clearInterval(this.timerid_);
		}	

		if (this.shyama_handler_) {
			this.shyama_handler_.destroy();
			this.shyama_handler_ = null;
		}

		console.info(chalk.yellow(`Destroyed Gyeeta Connection Handler`));
	}	

	get_shyama_handler()
	{
		return this.shyama_handler_;
	}	

	check_shyama_failover()
	{
		const			tnow = Date.now(), currid = this.curr_shyama_index_;
		let			check;

		if (true === this.shyama_handler_.is_shyama_conn_available()) {
			this.last_shyama_conn_ = tnow;
			this.isfirst_ = false;
			return;
		}

		if (tnow >= this.last_shyama_conn_ + 5 * 60 * 1000) {
			check = 1;
		}	
		else if (tnow >= this.last_shyama_conn_ + 2 * 60 * 1000 && this.isfirst_ === true) {
			check = 1;
		}

		if (!check) {
			console.info(`No Shyama Connections available since last ${(tnow - this.last_shyama_conn_)/1000} sec...`);
			return;
		}	

		if (this.shyama_host_arr_.length === 1) {
			return;
		}	
		
		this.nshyama_changes_++;
		this.curr_shyama_index_++;

		if (this.curr_shyama_index_ >= this.shyama_host_arr_.length) {
			this.curr_shyama_index_ = 0;
		}	
		
		console.info(`Checking for Shyama Failover as current Shyama Host ${this.shyama_host_arr_[currid]} Port ${this.shyama_port_arr_[currid]} not connected `
				+ `since last ${(tnow - this.last_shyama_conn_)/1000} sec : `
				+ `Trying next Shyama Host ${this.shyama_host_arr_[this.curr_shyama_index_]} Port ${this.shyama_port_arr_[this.curr_shyama_index_]}`);

		this.last_shyama_conn_ = tnow;

		this.shyama_handler_.destroy();

		this.shyama_handler_ = new ShyamaHandler(this.shyama_host_arr_[this.curr_shyama_index_], this.shyama_port_arr_[this.curr_shyama_index_], 
								this.num_conns_, this.is_action_conn_, this);
		
	}	
}

module.exports = {
	GyeetaHandler,
	GyCommError,
	NODE_VERSION_STR,
	JsonMsgTypes,
	NodeMsgTypes,
	NodeQueryTypes,
	ErrorTypes,
	setReqEventCallback
};	

