
'use strict';

const 		net = require('net');
const 		chalk = require('chalk');
		require('console-stamp')(console, { 
			format: ':date(yyyy-mm-dd HH:MM:ss.l)::label:' 
		});
const 		{ErrorTypes} = require('./gyeeta_comm.js');
const		{safetypeof} = require("./gyutil.js");

class CacheError extends Error 
{
	constructor(message) 
	{
		super(message);
		this.name = this.constructor.name;
	}
};

const CacheState = {
	NoInit		: "Uninitialized",
	ApiCalled	: "Waiting for API",
	Completed	: "Response Available",
};	

class CacheValue
{
	constructor(ttlsec, key, cache)
	{
		this.created_tmsec_		= Date.now();
		this.timeout_msecs_		= this.created_tmsec_ + ttlsec * 1000;
		this.cache_			= cache;
		this.key_			= key;
		this.promise_			= undefined;
		this.promise_reject_		= undefined;
		this.api_promise_		= undefined;
		this.value_			= undefined;
		this.value_size_		= 0;
		this.state_			= CacheState.NoInit;
	}

	// Returns promise
	get_data(api)
	{
		if (this.state_ === CacheState.Completed) {
			return Promise.resolve(this.value_);
		}	
		else if (this.state_ === CacheState.ApiCalled) {
			return this.promise_;
		}	
		else {
			this.promise_ = new Promise((resolve, reject) => {
				try {
					this.api_promise_ = api();
				}
				catch(e) {
					this.value_ 		= e; 
					this.state_ 		= CacheState.Completed;

					// Set Timeout to indicate deletion needed
					this.timeout_msecs_ 	= this.created_tmsec_;
					
					throw e;
				}	

				this.promise_reject_ = reject;

				return this.api_promise_
					.then(data => {
						this.value_ 	= data; 
						this.state_ 	= CacheState.Completed;

						this.cache_.respstats_.add(Date.now() - this.created_tmsec_);

						resolve(this.value_);

						this.promise_reject_ = undefined;
					})
					.catch((error) => {
						this.value_ 		= error; 
						this.state_ 		= CacheState.Completed;

						// Set Timeout to indicate deletion needed
						this.timeout_msecs_ 	= this.created_tmsec_;

						console.error(chalk.red(`Query Cache API call for ${this.key_} errored out : ${error}`));

						reject(this.value_); 

						this.promise_reject_ = undefined;
					});

			});

			this.state_ = CacheState.ApiCalled;

			return this.promise_;
		}	
	}	

	handle_timed_out(currmsec = Date.now())
	{
		if (this.key_ === undefined) {
			throw new CacheError('Internal Error : CacheValue.handle_timed_out called for an uninitialized entry');
		}	

		if (this.timeout_msecs_ < currmsec) {
			if (this.state_ === CacheState.ApiCalled) {
				console.error(chalk.red(`Cache Timed Out for ${this.key_} : Waited ${currmsec - this.created_tmsec_} msec`));
				
				if (typeof this.promise_reject_ === 'function') {
					try {
						this.promise_reject_(`Query Timed Out waiting for Response : Waited ${currmsec - this.created_tmsec_} msec`);
					}
					catch(e) {
						console.error(chalk.red(`Cache Timeout Reject Handler threw an exception : ${e}`));
					}	

					this.promise_reject_ = undefined;
				}

				this.cache_.stats_.ntimeout_no_resp_++;
			}

			this.cache_.stats_.ntotalsize_ -= this.value_size_;

			return true;
		}
		
		return false;
	}	

	is_timed_out(currmsec = Date.now())
	{
		if (this.key_ === undefined) {
			throw new CacheError('Internal Error : CacheValue.is_timed_out called for an uninitialized entry');
		}	

		return (this.timeout_msecs_ < currmsec);
	}	
};	


class GyWebCache
{
	static			MAX_ITEMS = 100000;	// Max 100,000 items

	constructor(identString = "Web Cache", maxItems = 16 * 1024, checkExpirysec = 300, maxTotalSize = 3 * 1024 * 1024 * 1024 /* 3 GB */)
	{
		this.ident_string_		= identString;
		this.max_items_			= Number(maxItems) < GyWebCache.MAX_ITEMS && Number(maxItems) > 0 ? Number(maxItems) : GyWebCache.MAX_ITEMS;
		this.check_expiry_sec_		= Number(checkExpirysec);

		if (isNaN(this.check_expiry_sec_) || this.check_expiry_sec_ < 60) {
			this.check_expiry_sec_ 	= 300;
		}

		this.max_total_size_		= Number(maxTotalSize);
		this.item_map_			= new Map();
		this.timerid_			= undefined;

		this.stats_			= {
			nadded_			: 0,
			ndeleted_		: 0,
			ntimeout_no_resp_	: 0,
			ntotalsize_		: 0,
			naddmiss		: 0,
			nhits_			: 0,
		
			reset()
			{
				this.nadded_		= 0;
				this.naddmiss		= 0;
				this.ndeleted_		= 0;
				this.ntimeout_no_resp_	= 0;
				this.ntotalsize_	= 0;
				this.nhits_		= 0;
			}	
		};	

		this.respstats_ = {
			totrespms	: 0,
			nquery		: 0,
			lasttotresp	: 0,
			lastnquery	: 0,

			resp1ms		: 0,
			resp10ms	: 0,
			resp50ms	: 0,
			resp200ms	: 0,
			resp500ms	: 0,
			resp1s		: 0,
			resp5s		: 0,
			over5s		: 0,

			lresp1ms	: 0,
			lresp10ms	: 0,
			lresp50ms	: 0,
			lresp200ms	: 0,
			lresp500ms	: 0,
			lresp1s		: 0,
			lresp5s		: 0,
			lover5s		: 0,

			print(prefix = 'Web Cache', dursec)
			{
				const		tavg = this.totrespms/(this.nquery > 0 ? this.nquery : 1);
				const		cavg = (this.totrespms - this.lasttotresp)/(this.nquery - this.lastnquery > 0 ? this.nquery - this.lastnquery : 1);

				console.info(`${prefix} API Call Cumulative Response Stats : Total API calls ${this.nquery}, Avg Response ${tavg.toFixed(3)} msec, Resp <= 1ms = ${this.resp1ms}, `,
					`\n\t\tResp <= 10ms = ${this.resp10ms}, Resp <= 50ms = ${this.resp50ms}, Resp <= 200ms = ${this.resp200ms}, Resp <= 500ms = ${this.resp500ms}, `,
					`Resp <= 1s = ${this.resp1s}, Resp <= 5s = ${this.resp5s}, Resp > 5s = ${this.over5s}`);

				console.info(`${prefix} API Call Last ${dursec/60} min Response Stats : API Calls ${this.nquery - this.lastnquery}, Avg Response ${cavg.toFixed(3)} msec`,
					`, Resp <= 1ms = ${this.resp1ms - this.lresp1ms}, \n\t\tResp <= 10ms = ${this.resp10ms - this.lresp10ms}, Resp <= 50ms = ${this.resp50ms - this.lresp50ms}, `,
					`Resp <= 200ms = ${this.resp200ms - this.lresp200ms}, Resp <= 500ms = ${this.resp500ms - this.lresp500ms}, `,
					`Resp <= 1s = ${this.resp1s - this.lresp1s}, Resp <= 5s = ${this.resp5s - this.lresp5s}, Resp > 5s = ${this.over5s - this.lover5s}`);

				this.lasttotresp 	= this.totrespms;
				this.lastnquery		= this.nquery;
				this.lresp1ms		= this.resp1ms;
				this.lresp10ms		= this.resp10ms;
				this.lresp50ms		= this.resp50ms;
				this.lresp200ms		= this.resp200ms;
				this.lresp500ms		= this.resp500ms;
				this.lresp1s		= this.resp1s;
				this.lresp5s		= this.resp5s;
				this.lover5s		= this.over5s;
			},

			reset()
			{
				this.totrespms		= 0;
				this.nquery		= 0;
				this.lasttotresp	= 0;
				this.lastnquery		= 0;

				this.resp1ms		= 0;
				this.resp10ms		= 0;
				this.resp50ms		= 0;
				this.resp200ms		= 0;
				this.resp500ms		= 0;
				this.resp1s		= 0;
				this.resp5s		= 0;
				this.over5s		= 0;

				this.lresp1ms		= 0;
				this.lresp10ms		= 0;
				this.lresp50ms		= 0;
				this.lresp200ms		= 0;
				this.lresp500ms		= 0;
				this.lresp1s		= 0;
				this.lresp5s		= 0;
				this.lover5s		= 0;
			},	

			add(tresp)
			{
				if (this.totrespms > Number.MAX_SAFE_INTEGER - 100 - tresp || this.nquery > Number.MAX_SAFE_INTEGER - 100) {
					console.log(`Web Cache : Resetting API Response Stats as Overflow likely...`);
					this.reset();
				}	

				this.totrespms += tresp;
				this.nquery++;

				if (tresp <= 1) {
					this.resp1ms++;
				}	
				else if (tresp <= 10) {
					this.resp10ms++;
				}	
				else if (tresp <= 50) {
					this.resp50ms++;
				}	
				else if (tresp <= 200) {
					this.resp200ms++;
				}	
				else if (tresp <= 500) {
					this.resp500ms++;
				}	
				else if (tresp <= 1000) {
					this.resp1s++;
				}	
				else if (tresp <= 5000) {
					this.resp5s++;
				}	
				else {
					this.over5s++;
				}	
			}	
		};

		this.check_expiry	= this.check_expiry.bind(this);
		this.timerid_		= setInterval(this.check_expiry, this.check_expiry_sec_ * 1000);
	}	

	destroy()
	{
		for (let [key, value] of this.item_map_) {

			if (value.key_ !== undefined) {
				value.handle_timed_out(value.timeout_msecs_ + 1);
			}
		}

		this.item_map_.clear();
		
		if (this.timerid_ !== undefined) {
			clearInterval(this.timerid_);
			this.timerid_ = undefined;
		}	

		this.stats_.reset();
	}	

	get_response(key, qrystr, ttlsec, res, api, sendcall)
	{
		let			entry, is_new = false, ressize = 0;

		if (typeof key !== 'string') {
			throw new CacheError(`${this.ident_string_} : Invalid Key type specified for Web Cache : ${typeof key}`);
		}

		if (typeof api !== 'function') {
			throw new CacheError(`${this.ident_string_} : Invalid api type specified for Web Cache : ${typeof api}`);
		}

		if (typeof sendcall !== 'function') {
			throw new CacheError(`${this.ident_string_} : Invalid sendcall type specified for Web Cache : ${typeof sendcall}`);
		}

		ttlsec = Number(ttlsec);

		if (true === isNaN(ttlsec)) {
			throw new CacheError(`${this.ident_string_} : Invalid ttlsec type specified for Web Cache : ${typeof ttlsec}`);
		}

		entry = this.item_map_.get(key);
		
		if (entry !== undefined) {
			const		currmsec = Date.now();

			if (true === entry.handle_timed_out(currmsec)) {

				console.debug(`${this.ident_string_} : Get Item for key ${key} returned an expired item. Resetting...`);

				this.item_map_.delete(key);
				entry = undefined;
			}	
			else {
				this.stats_.nhits_++;
				console.debug(`${this.ident_string_} : Cache Hit for query '${qrystr}' key ${key} : Cache Timeout at ${entry.timeout_msecs_} Current is ${currmsec} : `
							+ `Cache State "${entry.state_}" : #Cache Hits ${this.stats_.nhits_}`);
			}
		}	

		if (entry === undefined) {
			entry = new CacheValue(ttlsec, key, this);

			if ((this.item_map_.size < this.max_items_) && (this.stats_.ntotalsize_ < this.max_total_size_)) {

				this.item_map_.set(key, entry);
				this.stats_.nadded_++;
					
				is_new = true;
			}
			else {
				this.stats_.naddmiss++;
				console.debug(`Cache Max Limits Breached : Current Count ${this.item_map_.size} : Current Size ${this.stats_.ntotalsize_} : Cannot add new Cache Entry for key ${key}`);
			}
		}	

		entry.get_data(api).then((result) => {
			ressize = sendcall(res, result);

			if (is_new && safetypeof(ressize) === 'object') {

				if (ressize.status >= 300) {
					// Reset cache element as Query has not succeeded
					entry.timeout_msecs_ = Date.now() - 1;
				}	

				if (ressize.len > 0) {
					entry.value_size_ = ressize.len;
					this.stats_.ntotalsize_ += ressize.len;
				}
			}	
		})
		.catch((error) => {

			try {
				console.error(`There has been an error in the API call for query '${qrystr}' key ${entry.key_} : ${error}`)
				sendcall(res, JSON.stringify({error : ErrorTypes.ERR_SERV_ERROR, errmsg : `${error}`}));
			}	
			catch(e) {
			}	
		})
		.catch((error) => {
			console.error(`Error while handling catch exception : ${error}`)
		});
	}

	check_expiry()
	{
		let			nexp = 0;
		const			currmsec = Date.now();

		for (let [key, value] of this.item_map_) {
			if (true === value.handle_timed_out(currmsec)) {
				nexp++;

				this.item_map_.delete(key);
				this.stats_.ndeleted_++;
			}	
		}

		if (nexp > 0) {
			console.info(`${this.ident_string_} : Expiry check resulted in ${nexp} deletes`);
		}	

		this.print_stats();
	}	

	print_stats()
	{
		console.info(`${this.ident_string_} Stats : #Entries ${this.item_map_.size} : Total Added ${this.stats_.nadded_} : Entries Skipped due to Max Limits ${this.stats_.naddmiss} : `
			+ `Total Deleted by Expiry ${this.stats_.ndeleted_} : Total Bytes in Cache ${this.stats_.ntotalsize_} (${this.stats_.ntotalsize_ >> 20} MB) : #Cache Hits ${this.stats_.nhits_}`);

		if (this.stats_.nadded_ > Number.MAX_SAFE_INTEGER - 100) {
			console.info(`${this.ident_string_} Stats Reset as Max Limits reached...\n`);
			this.stats_.reset();
		}	

		this.respstats_.print(this.ident_string_, this.check_expiry_sec_);
	}	
};

module.exports = {
	GyWebCache,
};	

