import { createServer, type Socket } from 'node:net'
import type { PGliteDatabaseAdapter } from '../../db/pglite-adapter.js'

/**
 * Minimal Postgres Wire Protocol v3 Server on Node.js socket.
 * Allows tools like DBeaver, psql, and DataGrip to connect directly to ECHOLOG's embedded PGlite engine.
 */
export class PostgresWireServer {
  private server: ReturnType<typeof createServer> | null = null
  private adapter: PGliteDatabaseAdapter
  private port: number

  constructor(adapter: PGliteDatabaseAdapter, port = 5432) {
    this.adapter = adapter
    this.port = port
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => {
        this.handleClient(socket)
      })

      this.server.on('error', (err) => {
        reject(err)
      })

      this.server.listen(this.port, '0.0.0.0', () => {
        const addr = this.server?.address()
        const actualPort = typeof addr === 'object' && addr ? addr.port : this.port
        resolve(actualPort)
      })
    })
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve())
      } else {
        resolve()
      }
    })
  }

  private handleClient(socket: Socket): void {
    let initialized = false

    socket.on('data', async (chunk) => {
      try {
        if (!initialized) {
          // Startup packet: 4 bytes length, 4 bytes version (0x00030000 for v3.0, or 80877103 for SSL request)
          if (chunk.length < 8) return
          const code = chunk.readInt32BE(4)

          // SSLRequest: 80877103 (1234.5679)
          if (code === 80877103) {
            // Reply 'N' for SSL not supported (plain TCP)
            socket.write(Buffer.from('N'))
            return
          }

          // Regular StartupMessage (3.0): reply AuthenticationOk (0x52, len=8, code=0)
          const authOk = Buffer.alloc(9)
          authOk.write('R', 0)
          authOk.writeInt32BE(8, 1)
          authOk.writeInt32BE(0, 5) // 0 = AuthOK
          socket.write(authOk)

          // ParameterStatus messages (server_version, client_encoding)
          this.sendParameterStatus(socket, 'server_version', '16.0 (ECHOLOG Embedded PGlite)')
          this.sendParameterStatus(socket, 'client_encoding', 'UTF8')

          // ReadyForQuery (0x5A, len=5, status 'I' = idle)
          const ready = Buffer.alloc(6)
          ready.write('Z', 0)
          ready.writeInt32BE(5, 1)
          ready.write('I', 5)
          socket.write(ready)

          initialized = true
          return
        }

        // Handle Query message (type 'Q' = 0x51)
        const type = String.fromCharCode(chunk[0] ?? 0)
        if (type === 'Q') {
          // Query message
          const len = chunk.readInt32BE(1)
          const sql = chunk.subarray(5, 1 + len - 1).toString('utf8').trim()

          if (!sql || sql === ';') {
            this.sendEmptyQueryResponse(socket)
            this.sendReadyForQuery(socket)
            return
          }

          try {
            const result = await this.adapter.query(sql)
            this.sendQueryResult(socket, result.rows)
          } catch (err: any) {
            this.sendError(socket, err.message ?? 'SQL query error')
          }

          this.sendReadyForQuery(socket)
          return
        }

        if (type === 'X') {
          // Terminate message
          socket.end()
          return
        }
      } catch {
        socket.destroy()
      }
    })
  }

  private sendParameterStatus(socket: Socket, name: string, value: string): void {
    const nameBuf = Buffer.from(name + '\0', 'utf8')
    const valBuf = Buffer.from(value + '\0', 'utf8')
    const len = 4 + nameBuf.length + valBuf.length
    const buf = Buffer.alloc(1 + len)
    buf.write('S', 0)
    buf.writeInt32BE(len, 1)
    nameBuf.copy(buf, 5)
    valBuf.copy(buf, 5 + nameBuf.length)
    socket.write(buf)
  }

  private sendReadyForQuery(socket: Socket): void {
    const ready = Buffer.alloc(6)
    ready.write('Z', 0)
    ready.writeInt32BE(5, 1)
    ready.write('I', 5)
    socket.write(ready)
  }

  private sendEmptyQueryResponse(socket: Socket): void {
    const buf = Buffer.alloc(5)
    buf.write('I', 0)
    buf.writeInt32BE(4, 1)
    socket.write(buf)
  }

  private sendError(socket: Socket, message: string): void {
    const msgBuf = Buffer.from(`SERROR\0M${message}\0\0`, 'utf8')
    const len = 4 + msgBuf.length
    const buf = Buffer.alloc(1 + len)
    buf.write('E', 0)
    buf.writeInt32BE(len, 1)
    msgBuf.copy(buf, 5)
    socket.write(buf)
  }

  private sendQueryResult(socket: Socket, rows: any[]): void {
    if (rows.length === 0) {
      // CommandComplete (type 'C')
      const tag = Buffer.from('SELECT 0\0', 'utf8')
      const buf = Buffer.alloc(5 + tag.length)
      buf.write('C', 0)
      buf.writeInt32BE(4 + tag.length, 1)
      tag.copy(buf, 5)
      socket.write(buf)
      return
    }

    // RowDescription (type 'T')
    const firstRow = rows[0]
    const colNames = Object.keys(firstRow)
    const headerParts: Buffer[] = []

    for (const col of colNames) {
      const nameBuf = Buffer.from(col + '\0', 'utf8')
      const fieldBuf = Buffer.alloc(nameBuf.length + 18)
      nameBuf.copy(fieldBuf, 0)
      let offset = nameBuf.length
      fieldBuf.writeInt32BE(0, offset) // table oid
      fieldBuf.writeInt16BE(0, offset + 4) // col attr
      fieldBuf.writeInt32BE(25, offset + 6) // type oid (25 = text)
      fieldBuf.writeInt16BE(-1, offset + 10) // type size
      fieldBuf.writeInt32BE(-1, offset + 12) // type modifier
      fieldBuf.writeInt16BE(0, offset + 16) // format code (text)
      headerParts.push(fieldBuf)
    }

    const fieldsTotal = headerParts.reduce((acc, p) => acc + p.length, 0)
    const descLen = 4 + 2 + fieldsTotal
    const descBuf = Buffer.alloc(1 + descLen)
    descBuf.write('T', 0)
    descBuf.writeInt32BE(descLen, 1)
    descBuf.writeInt16BE(colNames.length, 5)
    let curOffset = 7
    for (const part of headerParts) {
      part.copy(descBuf, curOffset)
      curOffset += part.length
    }
    socket.write(descBuf)

    // DataRow (type 'D') for each row
    for (const row of rows) {
      const colBuffers: Buffer[] = []
      for (const col of colNames) {
        const val = row[col]
        if (val === null || val === undefined) {
          const nullLen = Buffer.alloc(4)
          nullLen.writeInt32BE(-1, 0)
          colBuffers.push(nullLen)
        } else {
          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
          const valBytes = Buffer.from(strVal, 'utf8')
          const colBuf = Buffer.alloc(4 + valBytes.length)
          colBuf.writeInt32BE(valBytes.length, 0)
          valBytes.copy(colBuf, 4)
          colBuffers.push(colBuf)
        }
      }

      const rowColsLen = colBuffers.reduce((acc, b) => acc + b.length, 0)
      const rowLen = 4 + 2 + rowColsLen
      const rowBuf = Buffer.alloc(1 + rowLen)
      rowBuf.write('D', 0)
      rowBuf.writeInt32BE(rowLen, 1)
      rowBuf.writeInt16BE(colNames.length, 5)
      let rOffset = 7
      for (const cb of colBuffers) {
        cb.copy(rowBuf, rOffset)
        rOffset += cb.length
      }
      socket.write(rowBuf)
    }

    // CommandComplete
    const tag = Buffer.from(`SELECT ${rows.length}\0`, 'utf8')
    const ccBuf = Buffer.alloc(5 + tag.length)
    ccBuf.write('C', 0)
    ccBuf.writeInt32BE(4 + tag.length, 1)
    tag.copy(ccBuf, 5)
    socket.write(ccBuf)
  }
}

