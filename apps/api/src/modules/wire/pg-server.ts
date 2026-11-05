import type { PGliteDatabaseAdapter } from '../../db/pglite-adapter.js'

/**
 * Retired experimental PostgreSQL wire gateway.
 *
 * The former prototype accepted every startup packet with AuthenticationOk and
 * did not implement a credential challenge or TLS. Keep this explicit stub so
 * any accidental future caller fails closed rather than opening an unauthenticated
 * database listener. Reintroducing the protocol requires a separately reviewed
 * authentication and transport-security design.
 */
export class PostgresWireServer {
  constructor(_adapter: PGliteDatabaseAdapter, _port = 5432) {}

  start(): Promise<number> {
    return Promise.reject(
      new Error('ECHOLOG Postgres wire gateway is retired: client authentication and TLS are not implemented.'),
    )
  }

  async stop(): Promise<void> {}
}
