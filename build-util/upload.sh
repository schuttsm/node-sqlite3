export ROOTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd ${ROOTDIR}/../stage/
../../s3cmd/s3cmd sync --no-check-md5 --acl-public ./*.tar.gz s3://node-sqlite3/ --dry-run
#../../s3cmd/s3cmd ls s3://node-sqlite3/
