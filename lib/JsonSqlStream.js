var _ = require('underscore'),
	stream = require('stream'),
	util = require('util');

function jsonSqlStream(opts) {
	this.writable = true;
	this.readable = true;
	this.table_name = opts.table_name;
	this.numWrites = 0;
}

util.inherits(jsonSqlStream, stream.Stream);
var has_been_run = false;
jsonSqlStream.prototype.read = function(data) {
	return true;
};

jsonSqlStream.prototype.write = function(data) {
	this.numWrites++;
	
	if (typeof data == 'string')
		data = JSON.parse(data);
	
	var sql = "INSERT INTO " + this.table_name + "(" 
		+ _(data).keys().join(", ") + ") VALUES ('" 
		+ _(data).values().join("', '") + "')";

	// console.log(this.numWrites);
	/*	
	if (!has_been_run) {
		has_been_run = true;
		console.log(sql);
	}
	*/
	this.emit('data', sql.replace(/\n/g, '') + '\n');
};

jsonSqlStream.prototype.end = function() {
	console.log('end');
};

exports.jsonSqlStream = jsonSqlStream;