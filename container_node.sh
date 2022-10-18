#!/usr/bin/env bash

PATH=$PATH:/usr/bin:/sbin:/usr/sbin:.
export PATH

if [ ! -f /nodewebserver/gyapp.js ]; then
	echo -e "\n\nERROR : Invalid nodewebserver container image as /nodewebserver/gyapp.js file not found...\n\n"
	exit 1
fi

cd /nodewebserver

trap 'echo "	Exiting now... Cleaning up..."; ./runwebserver.sh stop; exit 0' SIGINT SIGQUIT SIGTERM

CMD=${1:-"start"}

shift

./runwebserver.sh "$CMD" "$@" < /dev/null

if [ "$CMD" = "start" ] || [ "$CMD" = "restart" ]; then
	sleep 10

	if [ "x""`./runwebserver.sh printpids`" = "x" ]; then
		echo -e "\n\nERROR : nodewebserver not running currently. Exiting...\n\n"
		exit 1
	fi	

	while true; do
		sleep 30

		./runwebserver.sh ps

		if [ "x""`./runwebserver.sh printpids`" = "x" ]; then
			echo -e "\n\nERROR : nodewebserver not running currently. Exiting...\n\n"
			exit 1
		fi	
	done	
fi

exit $?

