// Parent Settings — license management + one-click backup download.
//
// Two independent panels:
//   1. License   — view/set/release the Chore Coin license key stored on
//                  this install. Value comes from /api/custom/license.
//                  Release makes it possible to activate the same key on
//                  a different machine (e.g. hardware upgrade).
//   2. Backup    — a big button that hits GET /api/custom/backup, which
//                  triggers app.CreateBackup() on the Go side and streams
//                  the resulting zip back as a file download.
//                  The user saves it locally; the wizard on a new install
//                  will accept it for restore (that flow ships next).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TabBarLayout, PageHeader } from '../../components/Layout'
import { PARENT_TABS } from './ParentDashboard'
import { pb, callCustom } from '../../pb'

interface LicenseState {
  licenseKey: string
  licenseActivatedAt: string
  installId: string
}

export default function Settings() {
  const [license, setLicense] = useState<LicenseState | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [licMsg, setLicMsg] = useState<string | null>(null)
  const [licErr, setLicErr] = useState<string | null>(null)

  const [downloading, setDownloading] = useState(false)
  const [bakErr, setBakErr] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await callCustom<LicenseState>('license')
      setLicense(r)
      setKeyInput('')
    } catch (e: any) {
      setLoadErr(e?.message || 'Failed to load license info')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const setKey = async () => {
    setLicMsg(null)
    setLicErr(null)
    setSaving(true)
    try {
      await callCustom('license/set', { licenseKey: keyInput.trim().toUpperCase() })
      setLicMsg('License activated.')
      await load()
    } catch (e: any) {
      setLicErr(e?.message || 'Could not apply the license key.')
    } finally {
      setSaving(false)
    }
  }

  const releaseKey = async () => {
    if (
      !window.confirm(
        'Release this license? You will be able to apply it to another machine, ' +
          'but this install will not have an active license until you enter one again. ' +
          'Your family data is not affected.',
      )
    ) {
      return
    }
    setLicMsg(null)
    setLicErr(null)
    setReleasing(true)
    try {
      await callCustom('license/release')
      setLicMsg('License released. You can now activate it on another install.')
      await load()
    } catch (e: any) {
      setLicErr(e?.message || 'Release failed.')
    } finally {
      setReleasing(false)
    }
  }

  const downloadBackup = async () => {
    setBakErr(null)
    setDownloading(true)
    try {
      // Build a URL with the parent's auth token so PB accepts the GET
      // without going through the SDK (which would try to parse the zip
      // body as JSON and fail).
      const token = pb.authStore.token
      const resp = await fetch('/api/custom/backup', {
        method: 'GET',
        headers: { Authorization: token },
      })
      if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        throw new Error(t || `HTTP ${resp.status}`)
      }
      // Extract filename from Content-Disposition, fall back to a stamp.
      const cd = resp.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match?.[1] || `chorecoin-backup-${Date.now()}.zip`
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setBakErr(e?.message || 'Backup failed.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <TabBarLayout tabs={PARENT_TABS}>
      <PageHeader
        title="Settings"
        subtitle="License + backup — everything else stays where it lives."
        action={
          <Link to="/" className="btn-ghost">
            ← Home
          </Link>
        }
      />

      {loadErr && (
        <div className="card mb-4 border-red-800 bg-red-950/40 text-red-200">{loadErr}</div>
      )}

      {/* ---- License panel -------------------------------------------- */}
      <section className="card mb-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">License</h2>
          <p className="text-xs text-slate-400 mt-1">
            One license per install. Release it here to move it to a new
            machine — your data stays put either way.
          </p>
        </div>

        {license?.licenseKey ? (
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Active license</div>
            <div className="font-mono text-lg break-all">{license.licenseKey}</div>
            {license.licenseActivatedAt && (
              <div className="text-xs text-slate-500">
                Activated {new Date(license.licenseActivatedAt).toLocaleString()}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-200">
            No license active on this install. Enter your key below, or
            leave it blank while Chore Coin is free during v0.
          </div>
        )}

        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
            {license?.licenseKey ? 'Replace license key' : 'Enter license key'}
          </label>
          <div className="flex items-stretch gap-2">
            <input
              className="input font-mono"
              placeholder="CHRC-XXXX-XXXX-XXXX-XXXX"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              maxLength={24}
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button
              className="btn-primary shrink-0"
              disabled={saving || keyInput.trim().length < 5}
              onClick={setKey}
            >
              {saving ? 'Saving…' : 'Activate'}
            </button>
          </div>
        </div>

        {license?.licenseKey && (
          <button
            className="btn-ghost text-red-400 w-full"
            disabled={releasing}
            onClick={releaseKey}
          >
            {releasing ? 'Releasing…' : 'Release this license'}
          </button>
        )}

        {licMsg && (
          <div className="text-sm rounded-lg px-4 py-3 bg-emerald-950/50 border border-emerald-800 text-emerald-200">
            {licMsg}
          </div>
        )}
        {licErr && (
          <div className="text-sm rounded-lg px-4 py-3 bg-red-950/50 border border-red-800 text-red-200">
            {licErr}
          </div>
        )}
      </section>

      {/* ---- Backup panel --------------------------------------------- */}
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Family backup</h2>
          <p className="text-xs text-slate-400 mt-1">
            One file containing every kid, chore, coin balance, and history
            entry. Save it somewhere safe — restore it on a new install
            during the setup wizard.
          </p>
        </div>

        <button
          className="btn-primary w-full"
          disabled={downloading}
          onClick={downloadBackup}
        >
          {downloading ? 'Preparing backup…' : '📦 Download family backup'}
        </button>

        <p className="text-xs text-slate-500">
          Downloads a <code className="text-slate-300">.zip</code> file that Chore Coin can restore.
          Nothing is uploaded — the backup goes straight from this server to
          your browser.
        </p>

        {bakErr && (
          <div className="text-sm rounded-lg px-4 py-3 bg-red-950/50 border border-red-800 text-red-200">
            {bakErr}
          </div>
        )}
      </section>

      {license?.installId && (
        <p className="mt-8 text-xs text-slate-600 text-center">
          Install ID: <code className="text-slate-500">{license.installId}</code>
        </p>
      )}
    </TabBarLayout>
  )
}
