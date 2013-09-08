export ROOTDIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd ${ROOTDIR}/../stage/
if [ -d Debug ]; then
cd Debug
../../../s3cmd/s3cmd sync --no-check-md5 --acl-public ./*.tar.gz s3://node-sqlite3/Debug/ --dry-run
cd ../
fi

if [ -d Release ]; then
cd Release
../../../s3cmd/s3cmd sync --no-check-md5 --acl-public ./*.tar.gz s3://node-sqlite3/Release/ --dry-run
cd ../
fi

#../../s3cmd/s3cmd ls s3://node-sqlite3/
