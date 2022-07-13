
const 		moment = require('moment');
const		{getRandomInt, getRandomFloat, delayExec} = require('./gyutil.js');

function getMockParthaList(numhosts, starttime)
{
	let 			nhosts = Number(numhosts);

	if (nhosts < 0) nhosts = 0;
	if (nhosts > 1000000) nhosts = 1000000;

	function getData() 
	{
		let			nmadhava, currpartha = 0;
		let			mockdata = [];

		nmadhava = Math.ceil(nhosts/128);

		for (let m = 0; m < nmadhava; ++m) {
			let		hoststate = [], madobj = {};
			let		npar = (nhosts > currpartha + 128 ? 128 : nhosts - currpartha);
			let		nparidle = Math.floor(npar * 0.01), npargood = Math.floor(npar * 0.2), nparok = Math.floor(npar * 0.5);
			let		nparbad = Math.floor(npar * 0.25), nparsevere = npar - (nparidle + npargood + nparok + nparbad);
			let		summary = {
				nhosts		: 0,
				ntotal_hosts	: 0,
				nhosts_idle	: 0,
				nhosts_good	: 0,
				nhosts_ok	: 0,
				nhosts_bad	: 0,
				nhosts_severe	: 0,
				nhosts_offline 	: 0,
				nprocissue_hosts: 0,
				nmemissue_hosts	: 0,
				ncpuissue_hosts	: 0,
				nlistissue_hosts: 0,
				nlisten		: 0,
				nlisten_issue	: 0,
				nlisten_severe	: 0,
			};	

			const initpar = (par, parnum) => {
				par.time	= starttime;
				par.parid	= String(parnum + 1 + (m + 1) * 1000000);
				par.host	= 'host' + Number(parnum + 1) + '.local';
				par.cluster 	= 'cluster' + Number(m + 1);
			};

			const updsumm = (par) => {
				summary.nhosts++;
				summary.ntotal_hosts++;

				if (par.state === 'Idle') {
					summary.nhosts_idle++;
				}
				else if (par.state === 'Good') {
					summary.nhosts_good++;
				}	
				else if (par.state === 'OK') {
					summary.nhosts_ok++;
				}	
				else if (par.state === 'Bad') {
					summary.nhosts_bad++;
				}	
				else if (par.state === 'Severe') {
					summary.nhosts_severe++;
				}	

				if (par.nprocissue > 0) {
					summary.nprocissue_hosts++;
				}

				if (par.nlistissue > 0) {
					summary.nlistissue_hosts++;
					summary.nlisten_issue += par.nlistissue;
					summary.nlisten_severe += par.nlistsevere;
				}	

				summary.nlisten += par.nlisten;

				if (par.cpuissue) {
					summary.ncpuissue_hosts++;
				}

				if (par.memissue) {
					summary.nmemissue_hosts++;
				}	
			};	


			for (let i = 0; i < nparidle; ++i) {
				let		obj = {};

				initpar(obj, currpartha);

				obj.state	= 'Idle';
				obj.nprocissue	= 0;
				obj.nprocsevere	= 0;
				obj.nproc	= getRandomInt(300, 500);
				obj.nlistissue	= 0;
				obj.nlistsevere	= 0;
				obj.nlisten	= getRandomInt(50, 200);
				obj.cpuissue	= false;
				obj.severecpu	= false;
				obj.memissue	= false;
				obj.severemem	= false;
				obj.dur30s	= 0;

				currpartha++;
				updsumm(obj);
				hoststate.push(obj);
			}

			for (let i = 0; i < npargood; ++i) {
				let		obj = {};

				initpar(obj, currpartha);

				obj.state	= 'Good';
				obj.nprocissue	= getRandomInt(1, 8);
				obj.nprocsevere	= 0;
				obj.nproc	= getRandomInt(200, 400);
				obj.nlistissue	= 0;
				obj.nlistsevere	= 0;
				obj.nlisten	= getRandomInt(100, 200);
				obj.cpuissue	= false;
				obj.severecpu	= false;
				obj.memissue	= false;
				obj.severemem	= false;
				obj.dur30s	= 5;

				currpartha++;
				updsumm(obj);
				hoststate.push(obj);
			}

			for (let i = 0; i < nparok; ++i) {
				let		obj = {};

				initpar(obj, currpartha);

				obj.state	= 'OK';
				obj.nprocissue	= getRandomInt(8, 16);
				obj.nprocsevere	= 0;
				obj.nproc	= getRandomInt(200, 400);
				obj.nlistissue	= getRandomInt(1, 4);
				obj.nlistsevere	= 0;
				obj.nlisten	= getRandomInt(100, 200);
				obj.cpuissue	= false;
				obj.severecpu	= false;
				obj.memissue	= true;
				obj.severemem	= false;
				obj.dur30s	= 10;

				currpartha++;
				updsumm(obj);
				hoststate.push(obj);
			}

			for (let i = 0; i < nparbad; ++i) {
				let		obj = {};

				initpar(obj, currpartha);

				obj.state	= 'Bad';
				obj.nprocissue	= getRandomInt(12, 32);
				obj.nprocsevere	= getRandomInt(1, 4);
				obj.nproc	= getRandomInt(200, 300);
				obj.nlistissue	= getRandomInt(5, 8);
				obj.nlistsevere	= 0;
				obj.nlisten	= getRandomInt(64, 200);
				obj.cpuissue	= true;
				obj.severecpu	= false;
				obj.memissue	= true;
				obj.severemem	= false;
				obj.dur30s	= 20;

				currpartha++;
				updsumm(obj);
				hoststate.push(obj);
			}

			for (let i = 0; i < nparsevere; ++i) {
				let		obj = {};

				initpar(obj, currpartha);

				obj.state	= 'Severe';
				obj.nprocissue	= getRandomInt(20, 40);
				obj.nprocsevere	= getRandomInt(10, 20);
				obj.nproc	= getRandomInt(300, 450);
				obj.nlistissue	= getRandomInt(10, 30);
				obj.nlistsevere	= getRandomInt(5, 10);
				obj.nlisten	= getRandomInt(50, 100);
				obj.cpuissue	= true;
				obj.severecpu	= true;
				obj.memissue	= true;
				obj.severemem	= false;
				obj.dur30s	= 25;

				currpartha++;
				updsumm(obj);
				hoststate.push(obj);
			}

			madobj.madhavaid	= 10000 + m + 1;
			madobj.hoststate	= hoststate;
			madobj.summary		= summary;
			madobj.lastchgmsec	= Date.now() - 1000000;
			madobj.metadata = {
				time : {disp : "Time", type : "string"},
				parid : {disp : "Host ID", type : "string"},
				host : {disp : "Host Name", type : "string"},
				cluster : {disp : "Cluster Name", type : "string"},
				state : {disp : "Host State", type : "string"},
				nprocissue : {disp : "Number of Processes with Issues", type : "number"},
				nprocsevere : {disp : "Number of Processes with Severe Issues", type : "number"},
				nproc : {disp : "Total Number of Processes", type : "number"},
				nlistissue : {disp : "Number of Listeners with Issues", type : "number"},
				nlistsevere : {disp : "Number of Listeners with Severe Issues", type : "number"},
				nlisten : {disp : "Total Number of TCP Listeners", type : "number"},
				cpuissue : {disp : "Does the Host have a CPU Utilization Issue", type : "boolean"},
				severecpu : {disp : "Does the Host have a Severe CPU Utilization Issue", type : "boolean"},
				memissue : {disp : "Does the Host have a Memory Utilization Issue", type : "boolean"},
				severemem : {disp : "Does the Host have a Severe Memory Utilization Issue", type : "boolean"},
				dur30s : {disp : "Duration of issues within last 30 seconds", type : "number"}
			}	

			mockdata.push(madobj);
		}

		

		return mockdata;
	}

	return new Promise((resolve, reject) => {
		delayExec(500).then(() => {
			resolve(JSON.stringify(getData()));
		})
		.catch((e) => reject(e));
	});
}

module.exports = {
	getMockParthaList, 
};	

