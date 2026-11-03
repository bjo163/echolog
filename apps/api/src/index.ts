import { loadConfig } from './config.js'
import { countUsers, createUser, openDatabase, purgeExpiredSessions } from './db.js'
import { createEchologServer } from './server.js'

async function main(): Promise<void> {
  try {
    const config = loadConfig()
    const database = openDatabase(config.databasePath)

    // First boot only: without a user nobody could sign in, so refuse to start
    // rather than expose an unstorable instance. The password is never logged.
    if (countUsers(database) === 0) {
      if (!config.bootstrapAdminLogin || !config.bootstrapAdminPassword) {
        throw new Error(
          'ECHOLOG has no users yet: set ECHOLOG_ADMIN_LOGIN and ECHOLOG_ADMIN_PASSWORD for the first boot.',
        )
      }
      createUser(database, {
        login: config.bootstrapAdminLogin,
        password: config.bootstrapAdminPassword,
        role: 'admin',
      })
      console.info(`ECHOLOG: created the first administrator "${config.bootstrapAdminLogin}".`)
    }

    const purged = purgeExpiredSessions(database)
    if (purged > 0) console.info(`ECHOLOG: removed ${purged} expired session(s).`)

    const app = createEchologServer(config, { database })
    await app.listen({ host: config.host, port: config.port })
    console.info(`ECHOLOG listening on http://${config.host}:${config.port}`)

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        app.close().then(
          () => {
            database.handle.close()
            process.exit(0)
          },
          (error: unknown) => {
            console.error(`ECHOLOG shutdown failed: ${error instanceof Error ? error.message : String(error)}`)
            process.exit(1)
          },
        )
      })
    }
  } catch (error) {
    console.error(`ECHOLOG failed to start: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

void main()
