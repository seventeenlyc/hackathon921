const assert = require('node:assert/strict');

// Validate PNG and lossless WebP headers without adding a browser/image dependency.
function readRasterSize(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        assert.ok(bytes.length >= 24);
        assert.equal(bytes.toString('ascii',12,16), 'IHDR');
        return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    }
    assert.ok(bytes.length >= 25, 'truncated WebP');
    assert.equal(bytes.toString('ascii',0,4), 'RIFF');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
    assert.equal(bytes.toString('ascii',8,12), 'WEBP');
    assert.equal(bytes.toString('ascii',12,16), 'VP8L', 'runtime WebP must be lossless');
    assert.equal(bytes[20], 0x2f);
    const header = bytes.readUInt32LE(21);
    assert.equal(header >>> 29, 0, 'unsupported WebP version');
    return {width: (header & 0x3fff) + 1, height: ((header >>> 14) & 0x3fff) + 1};
}
module.exports = {readRasterSize};
