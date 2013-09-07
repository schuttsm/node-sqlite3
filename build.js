#!/usr/bin/env node

/*

Must do:
 - new bucket + bucket logging

Really should do:
 - checksumming

Future:
 - dump build info into .txt sidecar to binary
   - include full node version and v8 version
 - travis/nvm/32bit auto-build and post to s3 for linux
 - be able to target multiple node versions and arches
   - so, enable build to request downloading and caching more than one
 - use require() to support node_modules location of binary?
 - add back development mode that detects changes to src/ files and rebuilds
 - or maybe just disable binary usage when not on a git tag?

*/

var package_json = require('./package.json');
var Binary = require('./lib/binary_name.js').Binary;
var util = require('./build-util/tools.js');
var mkdirp = require('mkdirp');
// https://github.com/isaacs/node-tar/issues/11
//var tar = require('tar');
var targz = require('tar.gz');
var cp = require('child_process');
var fs = require('fs');
var path = require('path');

var opts = {
    name: 'node_sqlite3',
    force: false,
    stage: false,
    target_arch: process.arch,
    platform: process.platform,
    uri: 'http://node-sqlite3.s3.amazonaws.com/'
}

function log(msg) {
    console.log('['+package_json.name+']: ' + msg);
}

function stat(opts,try_build) {
    fs.statSync(opts.runtime_module_path);
    log("Found " + opts.runtime_module_path + "'");
    if (!opts.stage && (opts.target_arch == process.arch)) {
        cp.execFile(process.execPath, ['lib/sqlite3'], function(err, stdout, stderr) {
            if (err || stderr) {
                log('Testing the binary failed: "' + err || stderr + '"');
                if (try_build) {
                    log('Attempting source compile...');
                    build(opts);
                }
            } else {
                log('Sweet: "' + opts.binary.filename() + '" is valid, node-sqlite3 is now installed!');
            }
        });
    }
}

function build(opts) {
    var shell_cmd = process.platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp';
    var shell_args = ['rebuild'].concat(opts.args);
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
    /*
    cmd.stderr.on('data',function(data) {
        console.error(data.slice(0,data.length-1).toString());
    })
    */
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
        move(opts);
    });
}

function tarball(opts) {
    var source = path.dirname(opts.staged_module_file_name);
    console.log('compressing: ' + source + ' to ' + opts.tarball_path);
    new targz(9).compress(source, opts.tarball_path, function(err) {
        if (err) throw err;
        log('Versioned binary staged for upload at ' + opts.tarball_path);
    });
}

function move(opts) {
    try {
        fs.statSync(opts.build_module_path);
    } catch (ex) {
        console.error('Build succeeded but target not found at ' + opts.build_module_path);
        process.exit(1);
    }
    try {
        log('creating: ' + opts.runtime_module_path)
        mkdirp.sync(path.dirname(opts.runtime_module_path));
    } catch (err) {
        log(err);
    }
    fs.renameSync(opts.build_module_path,opts.runtime_module_path);
    if (opts.stage) {
        try {
            log('creating staging: ' + path.dirname(opts.staged_module_file_name))
            mkdirp.sync(path.dirname(opts.staged_module_file_name));
        } catch (err) {
            log(err);
        }
        fs.writeFileSync(opts.staged_module_file_name,fs.readFileSync(opts.runtime_module_path));
        tarball(opts);
    } else {
        log('Installed in `' + opts.runtime_module_path + '`');
        stat(opts,false);
    }
}


var opts = util.parse_args(process.argv.slice(2),opts);
opts.binary = new Binary(opts);
var versioned = opts.binary.getRequirePath({platform:opts.platform,arch:opts.target_arch});
//opts.runtime_module_path = path.join(__dirname, 'lib', opts.binary.filename());
opts.runtime_module_path = path.join(__dirname, 'lib', versioned);
opts.runtime_folder = path.join(__dirname, 'lib', 'binding');
opts.staged_module_path = path.join(__dirname, 'stage', opts.binary.getModuleAbi(), opts.binary.getBasePath());
opts.staged_module_file_name = path.join(opts.staged_module_path,opts.binary.filename());
opts.build_module_path = path.join(__dirname, 'build', opts.binary.filename());
opts.tarball_path = path.join(__dirname, 'stage', opts.binary.getArchivePath());

if (!{ia32: true, x64: true, arm: true}.hasOwnProperty(opts.target_arch)) {
    console.error('Unsupported (?) architecture: `'+ opts.target_arch+ '`');
    process.exit(1);
}

if (!opts.force) {
    try {
        stat(opts,true);
    } catch (ex) {
        var from = opts.binary.getRemotePath();
        var to = opts.runtime_folder;
        util.download(from,to,function(err) {
            if (err) {
                log(from + ' not found, falling back to source compile (' + err + ')');
                build(opts);
            } else {
                try {
                    stat(opts,true);
                } catch (ex) {
                    // Stat failed
                    log(to + ' not found, falling back to source compile');
                    build(opts);
                }
            }        
        });
    }
} else {
    build(opts);
}
