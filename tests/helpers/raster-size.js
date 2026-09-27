const assert = require('node:assert/strict');

// Inspect PNG and WebP canvas dimensions without a browser/image dependency.
function readRasterSize(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        assert.ok(bytes.length >= 24);
        assert.equal(bytes.toString('ascii',12,16), 'IHDR');
        return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
    }
    assert.ok(bytes.length >= 20, 'truncated WebP');
    assert.equal(bytes.toString('ascii',0,4), 'RIFF');
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
    assert.equal(bytes.toString('ascii',8,12), 'WEBP');
    let dimensions;
    let hasImage = false;
    for (let offset = 12; offset + 8 <= bytes.length;) {
        const kind = bytes.toString('ascii',offset,offset+4);
        const length = bytes.readUInt32LE(offset+4);
        const data = offset+8;
        assert.ok(data+length <= bytes.length, 'truncated WebP chunk');
        if (kind === 'VP8X') {
            assert.equal(length,10);
            dimensions = {width: bytes.readUIntLE(data+4,3)+1, height: bytes.readUIntLE(data+7,3)+1};
        } else if (kind === 'VP8L') {
            assert.ok(length >= 5);
            assert.equal(bytes[data],0x2f);
            const header = bytes.readUInt32LE(data+1);
            assert.equal(header >>> 29,0);
            dimensions ||= {width:(header & 0x3fff)+1,height:((header >>> 14) & 0x3fff)+1};
            hasImage = true;
        } else if (kind === 'VP8 ') {
            assert.ok(length >= 10);
            assert.deepEqual([...bytes.subarray(data+3,data+6)],[0x9d,0x01,0x2a]);
            dimensions ||= {width:bytes.readUInt16LE(data+6)&0x3fff,height:bytes.readUInt16LE(data+8)&0x3fff};
            hasImage = true;
        }
        offset = data+length+(length%2);
    }
    assert.ok(hasImage && dimensions, 'missing WebP image');
    return dimensions;
}
module.exports = {readRasterSize};
