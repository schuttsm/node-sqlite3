#!/usr/bin/env node

// script adapted from https://github.com/laverdet/node-fibers
/*
TODO
 - release first without binaries?
 - move to tar.gz not just .gz
 - use process.versions.modules?
 - checksumming
 - travis auto-build and post to s3 for linux
 - document how to build for mac and windows
 - be able to target multiple node versions and arches
   - so, enable build to request downloading and caching more than one
 - use require() to support node_modules location of binary?
 - add back development mode that detects changes to src/ files and rebuilds
 - or maybe just disable binary usage when not on a git tag?
 - document how community can provide binaries?

 https://github.com/isaacs/npm/issues/1891#issuecomment-17051356
 https://github.com/joyent/node/issues/4398#issuecomment-11279441

*/

var cp = require('child_process');
var fs = require('fs');
var path = require('path');
var ProgressBar = require('./build-util/node-progress.js');
var http = require('http');
var url = require('url');
var module_package = require('./package.json');
var zlib = require('zlib');

var module_name = 'node_sqlite3';
var log_prefix = '['+module_name+']: '
var module_file_name = module_name + '.node';
var remote_binary_url = 'http://node-sqlite3.s3.amazonaws.com/';

var force = false;
var stage_binary = false;
var arch = process.arch;
var platform = process.platform;
var v8 = process.versions.v8.split('.').slice(0,2).join('.');
var module_maj_min = module_package.version.split('.').slice(0,2).join('.')
var module_abi = module_package.abi;

function build_module_name(module_name,platform,arch,v8,module_maj_min,module_abi) {
    var name = module_name + '-v' + module_maj_min + '.' + module_abi;
    return name += '-v8-' + v8 + '-' + platform + '-' + arch + '.node';
}

// Args passed directly
var args = process.argv.slice(2);

// also respect flags passed to npm install
if (process.env.npm_config_argv) {
    var argv_obj = JSON.parse(process.env.npm_config_argv);
    args = args.concat(argv_obj.cooked.slice(1))
}

stage_binary = (args.indexOf('--stage') > -1);
if (stage_binary) {
    force = true;
} else {
    var from_source = args.indexOf('--build-from-source');
    if ( from_source > -1) {
        // no specific module name passed
        var next_arg = args[from_source+1];
        if (!next_arg || next_arg.indexOf('--') <= 0) {
            force = true;
        } else if (next_arg == 'sqlite3'){
            force = true; 
        }
}
}

var target_arch = args.indexOf('--target_arch');
if (target_arch > -1) {
    var next_arg = args[target_arch+1];
    if (next_arg && next_arg.indexOf('--') < 0) {
        arch = next_arg;
    }
}

if (!{ia32: true, x64: true, arm: true}.hasOwnProperty(arch)) {
    console.error('Unsupported (?) architecture: `'+ arch+ '`');
    process.exit(1);
}

var build_module_path = path.join(__dirname, 'build', module_file_name);
var versioned_module_name = build_module_name(module_name,platform,arch,v8,module_maj_min,module_abi);
var remote_file_path = remote_binary_url + versioned_module_name + '.gz';
var staged_module_path = path.join(__dirname, 'precompiled', versioned_module_name);
var runtime_module_path = path.join(__dirname, 'lib', module_file_name);

function download(cb) {
    var dl = get({uri:remote_file_path,max_redirs:1,timeout:5000});
    //var gunzip = zlib.createGunzip();
    console.log(log_prefix + 'Attempting to download ' + remote_file_path);
    dl.asBuffer(function(err,buffer,headers) {
        if (err) return cb(err);
        console.log(log_prefix + 'Uncompressing to ' + runtime_module_path);
        zlib.gunzip(buffer,function(err,filedata) {
            if (err) return cb(err);
            fs.writeFile(runtime_module_path,filedata,cb);
        });
    })
}

function download_progress(callback) {
    console.log(log_prefix + 'Checking for ' + remote_file_path);
    var uri = url.parse(remote_file_path);
    var req = http.request(uri);
    req.on('response', function(res){
        // needed for end to be called
        res.resume();
        if (res.statusCode !== 200) {
            return callback(new Error('Server returned '+ res.statusCode));
        }
        var len = parseInt(res.headers['content-length'], 10);
        console.log();
        var bar = new ProgressBar('  downloading [:bar] :percent :etas', {
          complete: '='
        , incomplete: ' '
        , width: 40
        , total: len
        });
        function returnBuffer() {
            for (var length = 0, i = 0; i < out.length; i++) {
                length += out[i].length;
            }
            var result = new Buffer(length);
            for (var pos = 0, j = 0; j < out.length; j++) {
                out[j].copy(result, pos);
                pos += out[j].length;
            }
            zlib.gunzip(result,function(err,filedata) {
                if (err) return cb(err);
                fs.writeFile(runtime_module_path,filedata,callback);
            });
        }
        var out = [];
        res.on('data', function(chunk) {
            bar.tick(chunk.length);
            out.push(chunk);
        });
        res.on('end', function(){
            returnBuffer();
        });
        res.on('close', function(){
            returnBuffer();
        });
    });
    req.on('error', function(err){
        callback(err);
    });
    req.end();
}

function stat(try_build) {
    fs.statSync(runtime_module_path);
    console.log(log_prefix + "Found " + runtime_module_path + "'");
    cp.execFile(process.execPath, ['lib/sqlite3'], function(err, stdout, stderr) {
        if (err || stderr) {
            console.log(log_prefix + 'Testing the binary failed: "' + err || stderr + '"');
            if (try_build) {
                console.log(log_prefix + 'Attempting source compile...');
                build();
            }
        } else {
            console.log(log_prefix + 'Sweet: "' + module_file_name + '" is valid, node-sqlite3 is now installed!');
        }
    });
}

function build() {
    var shell_cmd = process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp';
    var shell_args = ['rebuild'].concat(args);
    var cmd = cp.spawn(shell_cmd,shell_args);
    cmd.on('error', function(err) {
        if (err) {
            console.error("Failed to execute '" + shell_cmd + ' ' + shell_args.join(' ') + "' (" + err + ")");
            return process.exit(1);
        }
    });
    cmd.stdout.on('data',function(data) {
        console.log(data.slice(0,data.length-1).toString());
    })
    cmd.stderr.on('data',function(data) {
        console.error(data.slice(0,data.length-1).toString());
    })
    cmd.on('exit', function(err) {
        if (err) {
            if (err === 127) {
                console.error(
                    'node-gyp not found! Please upgrade your install of npm! You need at least 1.1.5 (I think) '+
                    'and preferably 1.1.30.'
                );
            } else {
                console.error('Build failed');
            }
            return process.exit(err);
        }
        move();
    });
}

function move() {
    try {
        fs.statSync(build_module_path);
    } catch (ex) {
        console.error('Build succeeded but target not found at ' + build_module_path);
        process.exit(1);
    }
    fs.renameSync(build_module_path,runtime_module_path);
    if (stage_binary) {
        try {
            fs.mkdirSync(path.dirname(staged_module_path));
        } catch (ex) {}
        fs.writeFileSync(staged_module_path,fs.readFileSync(runtime_module_path));
        console.log(log_prefix + 'Versioned binary staged for upload at ' + staged_module_path);
    } else {
        console.log(log_prefix + 'Installed in `' + runtime_module_path + '`');
        stat(false);
    }
}

if (!force) {
    try {
        stat(true);
    } catch (ex) {
        download_progress(function(err) {
            if (err) {
                console.log(log_prefix + remote_file_path + ' not found, falling back to source compile (' + err + ')');
                build();
            } else {
                try {
                    stat(true);
                } catch (ex) {
                    // Stat failed
                    console.log(log_prefix + runtime_module_path + ' not found, falling back to source compile');
                    build();
                }
            }        
        });
    }
} else {
    build();
}

