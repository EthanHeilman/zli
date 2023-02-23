#!/bin/sh
set -e

confdir=$1/pgconf

mkdir -p $confdir
touch $confdir/ca.crt $confdir/server.crt $confdir/server.key
chmod 600 $confdir/*
chown postgres $confdir/*

set +e
