
var path = require('path');

var Binary = function(options) {
	var options = options || {};
	var package_json = options.package_json || require('../package.json');
	this.name = options.name || 'binding';
	this.uri = options.uri || 'http://'+this.name+'.s3.amazonaws.com/';
	this.module_maj_min = package_json.version.split('.').slice(0,2).join('.');
  this.module_abi = package_json.abi;
  this.platform = options.platform || process.platform;
  this.target_arch = options.target_arch || process.arch;
  if (process.versions.modules) {
    this.node_abi = 'node-v' + process.versions.modules
  } else {
    this.node_abi = '-v8' + process.versions.v8.split('.').slice(0,2).join('.');
  }
}

Binary.prototype.filename = function() {
	return this.name + '.node';
}

Binary.prototype.compression = function() {
	return '.tar.gz';
}

Binary.prototype.getBasePath = function(options) {
    return this.node_abi
           + '-' + this.platform
           + '-' + this.target_arch;
}

Binary.prototype.getRequirePath = function(options) {
    return './' + path.join('binding',
           	         this.getBasePath(options),
           	         this.filename());
}

Binary.prototype.getModuleAbi = function(options) {
	return this.name + '-v' + this.module_maj_min + '.' + this.module_abi;
}

Binary.prototype.getArchivePath = function(options) {
    return this.getModuleAbi()
           + '-'
           + this.getBasePath(options)
           + this.compression();
}

Binary.prototype.getRemotePath = function(options) {
    return this.uri+this.getArchivePath();
}

module.exports.Binary = Binary;