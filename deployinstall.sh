#!/bin/bash -x

shopt -s dotglob

if [ -z "$1" ]; then
	echo -e "\n\nUsage : $0 <Install Base Dir>\n\n"
	exit 1
fi	

ODIR="$1"/nodewebserver	

mkdir -p $ODIR 2> /dev/null

if [ ! -d $ODIR ]; then
	echo -e "\n\nERROR : Failed to create install dir $ODIR\n\n"
	exit 1
fi	
	
rm -rf $ODIR 2> /dev/null	
	
cp -a . $ODIR

if [ $? -ne 0 ]; then
	echo -e "\n\nERROR : Failed to copy to install dir $ODIR\n\n"
	exit 1
fi

rm -Rf $ODIR/{.git,.gitignore,buildcontainer.sh,container_node.sh,Dockerfile,.dockerignore,deployinstall.sh}

echo -e "\nInstalled nodewebserver to $ODIR successfully...\n"

exit 0
