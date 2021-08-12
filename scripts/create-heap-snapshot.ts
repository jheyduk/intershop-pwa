const fs = require('fs');
const v8 = require('v8');

export function createHeapSnapshot() {
  const snapshotStream = v8.getHeapSnapshot();
  // It's important that the filename end with `.heapsnapshot`,
  // otherwise Chrome DevTools won't open it.
  const fileName = `tmp/${process.pid}.${Date.now()}.heapsnapshot`;
  const fileStream = fs.createWriteStream(fileName);
  snapshotStream.pipe(fileStream);
}
