/**
 * `pnpm user:add` — create an operator account in the local identity store.
 *
 * The store is the SQLite file named by ECHOLOG_DATABASE_PATH, so this is how a
 * second operator joins an instance, and how an instance whose bootstrap admin
 * was never configured gets its first account. The password may be passed with
 * --password or through the ECHOLOG_USER_PASSWORD environment variable; the
 * environment form keeps the secret out of shell history and process listings.
 * Nothing here ever reads or prints a stored hash, and an issued API key is
 * printed exactly once because only its hash survives in the database.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { parseConfig } from '../config.js'
import {
  closeDatabase,
  createUser,
  findUserByLogin,
  issueApiKey,
  openDatabase,
  type Role,
} from '../db.js'

export const USER_ADD_USAGE = [
  'Usage: pnpm user:add --login <name> [--role admin|member] [--key] [--key-name <name>]',
  '',
  '  --login      Account name (required, max 60 characters).',
  '  --role       admin or member. Defaults to member.',
  '  --password   Secret, at least 12 characters. Prefer ECHOLOG_USER_PASSWORD',
  '               in the environment so the value stays out of shell history.',
  '  --key        Also issue one machine API key and print it once.',
  '  --key-name   Name for that key. Defaults to "<login> api key".',
  '',
  'The identity store path comes from ECHOLOG_DATABASE_PATH, exactly like the',
  'service itself. Unset ECHOLOG_USER_PASSWORD again after the command runs.',
].join('\n')

export interface UserAddRequest {
  login: string
  password: string
  role: Role
  key: boolean
  keyName: string
}

export class UserAddUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserAddUsageError'
  }
}

const RequestSchema = z.object({
  login: z.string().trim().min(1).max(60),
  password: z.string().min(12, 'at least 12 characters').max(256),
  role: z.enum(['admin', 'member']),
  key: z.boolean(),
  keyName: z.string().trim().min(1).max(60),
})

/** Read the command line the way the service reads --port: no argument parser. */
export function parseUserAddArgs(
  args: readonly string[],
  environment: Record<string, string | undefined> = {},
): UserAddRequest {
  const flags = new Map<string, string>()
  let key = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined || !argument.startsWith('--')) {
      throw new UserAddUsageError(`Unexpected argument: ${String(argument)}.`)
    }
    const separator = argument.indexOf('=')
    const name = separator === -1 ? argument.slice(2) : argument.slice(2, separator)
    if (!['login', 'role', 'password', 'key-name'].includes(name)) {
      if (name === 'key') {
        if (key) throw new UserAddUsageError('Invalid argument: --key may be provided only once.')
        key = true
        continue
      }
      throw new UserAddUsageError(`Unknown argument: --${name}.`)
    }

    const inline = separator === -1 ? undefined : argument.slice(separator + 1)
    const supplied = inline ?? args[index + 1]
    if (supplied === undefined || supplied.startsWith('--')) {
      throw new UserAddUsageError(`Invalid argument: --${name} requires a value.`)
    }
    if (flags.has(name)) throw new UserAddUsageError(`Invalid argument: --${name} may be provided only once.`)
    flags.set(name, supplied)
    if (inline === undefined) index += 1
  }

  const login = flags.get('login')
  if (login === undefined) throw new UserAddUsageError('Invalid argument: --login is required.')
  const password = flags.get('password') ?? environment.ECHOLOG_USER_PASSWORD ?? ''
  const role = flags.get('role') ?? 'member'
  const keyName = flags.get('key-name') ?? `${login} api key`

  const parsed = RequestSchema.safeParse({ login, password, role, key, keyName })
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${String(issue.path[0] ?? 'argument')}: ${issue.message}`)
      .join('; ')
    throw new UserAddUsageError(`Invalid user:add arguments: ${details}`)
  }
  return parsed.data
}

/** Open the configured store, add the account, and return the operator report. */
export function runUserAdd(
  environment: Record<string, string | undefined>,
  args: readonly string[],
): string {
  const request = parseUserAddArgs(args, environment)
  const config = parseConfig(environment)
  const database = openDatabase(config.databasePath)
  try {
    if (findUserByLogin(database, request.login)) {
      throw new UserAddUsageError(`An account named "${request.login}" already exists in ${config.databasePath}.`)
    }
    const user = createUser(database, { login: request.login, password: request.password, role: request.role })
    const report = [`Created ${user.role} "${user.login}" in ${config.databasePath}.`]
    if (request.key) {
      const issued = issueApiKey(database, request.keyName, request.role)
      report.push(
        `API key "${issued.name}" — shown once, store it now: ${issued.token}`,
        `Prefix for administration: ${issued.prefix}`,
      )
    }
    return report.join('\n')
  } finally {
    closeDatabase(database)
  }
}

function main(args: readonly string[], environment: Record<string, string | undefined>): void {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.info(USER_ADD_USAGE)
    return
  }
  try {
    console.info(runUserAdd(environment, args))
  } catch (error) {
    console.error(error instanceof Error ? `${error.message}\n\n${USER_ADD_USAGE}` : String(error))
    process.exitCode = 1
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (invokedDirectly) main(process.argv.slice(2), process.env)
