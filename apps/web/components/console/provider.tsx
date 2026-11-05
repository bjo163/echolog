'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuditLogRecord, ConsoleRuntimeFacts, S3KeyRecord, StorageStats } from '@echolog/contract'
import {
  deleteObject,
  fetchAuditLogs,
  fetchFixityReport,
  fetchHealth,
  fetchRuntimeFacts,
  fetchStorageStats,
  issueApiKey,
  listApiKeys,
  listS3Keys,
  listUsers,
  revokeApiKey,
  runFixityScan,
  runGarbageCollection,
  setUserDisabled,
  signIn,
  signOut,
  whoAmI,
  type ApiKeyRow,
  type HealthSnapshot,
  type IssuedKey,
  type Principal,
  type UserRow,
} from '@echolog/shared'
import { describeFailure, type Failure } from '../../lib/api-client'

/**
 * The console state container.
 *
 * Data is loaded per endpoint rather than as one bundle, so a single failing
 * route degrades that panel only. The console never substitutes a zero for a
 * value it could not read: an endpoint that failed keeps its previous state
 * and is reported as failed.
 */

export interface Notice {
  tone: 'good' | 'warn' | 'bad'
  text: string
}

export interface FixityReport {
  objectsScanned: number
  corruptionsFound: number
  autoHealed: number
  lastScrubTime: string | null
}

export interface ConsoleValue {
  principal: Principal | null
  authReady: boolean
  runtime: ConsoleRuntimeFacts | null
  stats: StorageStats | null
  aliases: S3KeyRecord[]
  audit: AuditLogRecord[]
  health: HealthSnapshot | null
  users: UserRow[]
  apiKeys: ApiKeyRow[]
  fixity: FixityReport | null
  loading: boolean
  failure: Failure | null
  notice: Notice | null
  isAdmin: boolean
  nowMs: number
  /** When every core endpoint last answered together. Null until that happens. */
  lastSuccessMs: number | null
  refresh: () => Promise<void>
  signInWith: (login: string, password: string) => Promise<boolean>
  signOutOf: () => Promise<void>
  collectGarbage: () => Promise<void>
  runScan: () => Promise<void>
  createKey: (name: string, role: 'admin' | 'member') => Promise<IssuedKey | null>
  revoke: (prefix: string) => Promise<void>
  setDisabled: (login: string, disabled: boolean) => Promise<void>
  removeObject: (digest: string) => Promise<void>
  setNotice: (notice: Notice | null) => void
}

const ConsoleContext = createContext<ConsoleValue | null>(null)

export function useConsole(): ConsoleValue {
  const value = useContext(ConsoleContext)
  if (!value) throw new Error('useConsole must be used inside the console provider.')
  return value
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [runtime, setRuntime] = useState<ConsoleRuntimeFacts | null>(null)
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [aliases, setAliases] = useState<S3KeyRecord[]>([])
  const [audit, setAudit] = useState<AuditLogRecord[]>([])
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([])
  const [fixity, setFixity] = useState<FixityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [lastSuccessMs, setLastSuccessMs] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      fetchRuntimeFacts(),
      fetchHealth(),
      fetchStorageStats(),
      listS3Keys(),
      fetchAuditLogs(100),
    ])
    const runtimeResult = results[0]
    const healthResult = results[1]
    const statsResult = results[2]
    const aliasResult = results[3]
    const auditResult = results[4]
    if (runtimeResult && runtimeResult.status === 'fulfilled') setRuntime(runtimeResult.value)
    if (healthResult && healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (statsResult && statsResult.status === 'fulfilled') setStats(statsResult.value)
    if (aliasResult && aliasResult.status === 'fulfilled') setAliases(aliasResult.value)
    if (auditResult && auditResult.status === 'fulfilled') setAudit(auditResult.value)
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    setFailure(rejected ? describeFailure(rejected.reason) : null)
    // Only a refresh where every core endpoint answered counts as successful;
    // a partial refresh must not be reported as if the whole picture were current.
    if (!rejected) setLastSuccessMs(Date.now())
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const current = await whoAmI().catch(() => null)
      if (cancelled) return
      setPrincipal(current)
      setAuthReady(true)
      if (current) await refresh()
      else setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const loadAdminData = useCallback(async () => {
    const results = await Promise.allSettled([listUsers(), listApiKeys(), fetchFixityReport()])
    const userResult = results[0]
    const keyResult = results[1]
    const fixityResult = results[2]
    if (userResult && userResult.status === 'fulfilled') setUsers(userResult.value)
    if (keyResult && keyResult.status === 'fulfilled') setApiKeys(keyResult.value)
    if (fixityResult && fixityResult.status === 'fulfilled') setFixity(fixityResult.value)
  }, [])

  const isAdmin = principal ? principal.role === 'admin' : false

  useEffect(() => {
    if (isAdmin) void loadAdminData()
  }, [isAdmin, loadAdminData])

  const value = useMemo<ConsoleValue>(
    () => ({
      principal,
      authReady,
      runtime,
      stats,
      aliases,
      audit,
      health,
      users,
      apiKeys,
      fixity,
      loading,
      failure,
      notice,
      isAdmin,
      nowMs,
      lastSuccessMs,
      refresh,
      setNotice,
      signInWith: async (login, password) => {
        setFailure(null)
        try {
          const next = await signIn(login, password)
          setPrincipal(next)
          await refresh()
          if (next.role === 'admin') await loadAdminData()
          return true
        } catch (error) {
          setFailure(describeFailure(error))
          return false
        }
      },
      signOutOf: async () => {
        await signOut().catch(() => undefined)
        setPrincipal(null)
        setUsers([])
        setApiKeys([])
        setFixity(null)
      },
      collectGarbage: async () => {
        try {
          const outcome = await runGarbageCollection()
          setNotice({
            tone: 'good',
            text:
              'Garbage collection removed ' +
              String(outcome.deleted.length) +
              ' object(s) and freed ' +
              String(outcome.bytes_freed) +
              ' bytes. ' +
              String(outcome.held.length) +
              ' object(s) were held.',
          })
          await refresh()
        } catch (error) {
          setFailure(describeFailure(error))
        }
      },
      runScan: async () => {
        try {
          const outcome = await runFixityScan()
          setFixity(outcome.results)
          setNotice({
            tone: outcome.results.corruptionsFound > 0 ? 'bad' : 'good',
            text:
              'Fixity scan completed. ' +
              String(outcome.results.objectsScanned) +
              ' object(s) re-hashed, ' +
              String(outcome.results.corruptionsFound) +
              ' mismatch(es) found.',
          })
          await refresh()
        } catch (error) {
          setFailure(describeFailure(error))
        }
      },
      createKey: async (name, role) => {
        try {
          const issued = await issueApiKey(name, role)
          await loadAdminData()
          return issued
        } catch (error) {
          setFailure(describeFailure(error))
          return null
        }
      },
      revoke: async (prefix) => {
        try {
          await revokeApiKey(prefix)
          await loadAdminData()
        } catch (error) {
          setFailure(describeFailure(error))
        }
      },
      setDisabled: async (login, disabled) => {
        try {
          await setUserDisabled(login, disabled)
          await loadAdminData()
        } catch (error) {
          setFailure(describeFailure(error))
        }
      },
      removeObject: async (digest) => {
        try {
          await deleteObject(digest)
          await refresh()
        } catch (error) {
          setFailure(describeFailure(error))
        }
      },
    }),
    [
      principal,
      authReady,
      runtime,
      stats,
      aliases,
      audit,
      health,
      users,
      apiKeys,
      fixity,
      loading,
      failure,
      notice,
      isAdmin,
      nowMs,
      lastSuccessMs,
      refresh,
      loadAdminData,
    ],
  )

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
}
