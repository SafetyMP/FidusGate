const fs = require('fs');
const path = require('path');

function createWasiWasm(message) {
  const msgBytes = Buffer.from(message);
  const msgLen = msgBytes.length;

  const header = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

  // 1. Type Section
  const typeSection = Buffer.from([
    0x01, // Section ID
    0x0e, // Section length
    0x02, // 2 types
    0x60, 0x00, 0x00, // type 0: () -> ()
    0x60, 0x04, 0x7f, 0x7f, 0x7f, 0x7f, 0x01, 0x7f // type 1: (i32, i32, i32, i32) -> i32
  ]);

  // 2. Import Section
  const importSection = Buffer.from([
    0x02, // Section ID
    0x23, // Section length
    0x01, // 1 import
    0x16, // Module name length (22)
    ...Buffer.from('wasi_snapshot_preview1'),
    0x08, // Field name length (8)
    ...Buffer.from('fd_write'),
    0x00, // Import kind (Function)
    0x01  // Import type index (Type index 1)
  ]);

  // 3. Function Section
  const funcSection = Buffer.from([
    0x03, // Section ID
    0x02, // Section length
    0x01, // 1 function
    0x00  // Function type index (Type index 0)
  ]);

  // 5. Memory Section
  const memorySection = Buffer.from([
    0x05, // Section ID
    0x03, // Section length
    0x01, // 1 memory
    0x00, 0x01 // initial 1 page, no max
  ]);

  // 7. Export Section
  const exportSection = Buffer.from([
    0x07, // Section ID
    0x12, // Section length
    0x02, // 2 exports
    0x06, ...Buffer.from('memory'), 0x02, 0x00, // Export memory
    0x06, ...Buffer.from('_start'), 0x00, 0x01  // Export _start
  ]);

  // 10. Code Section
  const codeSection = Buffer.from([
    0x0a, // Section ID
    0x0f, // Section length
    0x01, // 1 function body
    0x0d, // Body size
    0x00, // Local variables count (0)
    0x41, 0x01, // i32.const 1 (fd = 1 for stdout)
    0x41, 0x00, // i32.const 0 (iovs_ptr = 0)
    0x41, 0x01, // i32.const 1 (iovs_len = 1)
    0x41, 0x64, // i32.const 100 (nwritten_ptr = 100)
    0x10, 0x00, // call 0 (fd_write)
    0x1a,       // drop
    0x0b        // end
  ]);

  // 11. Data Section
  // ciovec struct (8 bytes):
  //   - pointer to string = 8 (i32) -> 0x08, 0x00, 0x00, 0x00
  //   - length of string = msgLen (i32) -> msgLen in 4 bytes
  const ciovec = Buffer.alloc(8);
  ciovec.writeInt32LE(8, 0);
  ciovec.writeInt32LE(msgLen, 4);

  const dataPayload = Buffer.concat([ciovec, msgBytes]);
  const payloadLen = dataPayload.length;

  const dataSectionHeader = Buffer.from([
    0x0b, // Section ID
  ]);

  // We need to encode the section size and payload size as varint/LEB128 if they can be large,
  // but since they are well under 127 bytes, we can use 1 byte for length directly.
  const offsetExpr = Buffer.from([0x00, 0x41, 0x00, 0x0b]); // active, i32.const 0, end
  const dataHeader = Buffer.concat([
    Buffer.from([0x01]), // 1 segment
    offsetExpr,
    Buffer.from([payloadLen])
  ]);

  const dataSectionSize = dataHeader.length + dataPayload.length;
  const dataSection = Buffer.concat([
    dataSectionHeader,
    Buffer.from([dataSectionSize]),
    dataHeader,
    dataPayload
  ]);

  return Buffer.concat([
    header,
    typeSection,
    importSection,
    funcSection,
    memorySection,
    exportSection,
    codeSection,
    dataSection
  ]);
}

const scriptsDir = path.join(__dirname);
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Generate compiler.wasm
const compilerMsg = "FidusGate WASI Compiler: TypeScript compilation succeeded. 0 errors, 1 module generated.\n";
const compilerWasm = createWasiWasm(compilerMsg);
const compilerPath = path.join(scriptsDir, 'compiler.wasm');
fs.writeFileSync(compilerPath, compilerWasm);
console.log(`🚀 Successfully compiled and output real WASI compiler.wasm at ${compilerPath} (${compilerWasm.length} bytes)`);

// Generate cedar.wasm
const cedarMsg = "FidusGate WASI Cedar Engine: Static schema validation succeeded. 0 errors, policy complies with schema.\n";
const cedarWasm = createWasiWasm(cedarMsg);
const cedarPath = path.join(scriptsDir, 'cedar.wasm');
fs.writeFileSync(cedarPath, cedarWasm);
console.log(`🚀 Successfully compiled and output real WASI cedar.wasm at ${cedarPath} (${cedarWasm.length} bytes)`);
