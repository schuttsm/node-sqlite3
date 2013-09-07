export ROOTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd ${ROOTDIR}/../stage/
#tar cfHz 
#tar cfHz out.tar.gz node-v11-darwin-x64/

# extracter = tar.Extract({ path: devDir, strip: 1, filter: isValid })
#gzip *.node
../../s3cmd/s3cmd sync --no-check-md5 --acl-public ./*.tar.gz s3://node-sqlite3/
#../../s3cmd/s3cmd ls s3://node-sqlite3/
#2013-08-29 00:55    347244   s3://node-sqlite3/node_sqlite3-v2.1.a-v8-3.14-darwin-ia32.node.tar.gz