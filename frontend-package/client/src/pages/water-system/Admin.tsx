import React, { useState, useRef, useEffect } from 'react'
import { Link } from 'wouter'
import { WaterSystemLayout } from '@/components/water-system/WaterSystemLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useNavLayout } from '@/contexts/NavLayoutContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useToast } from '@/hooks/use-toast'
import { settingsApi, type EmailConfig } from '@/lib/distributionApi'
import {
  Upload,
  Mail,
  Send,
  Database,
  Cloud,
  Server,
  Check,
  Loader2,
  LayoutPanelTop,
  ArrowRight,
} from 'lucide-react'

const DEFAULT_CONFIG: EmailConfig = {
  send_method: 'smtp',
  smtp_server: '',
  smtp_port: 587,
  username: '',
  password: '',
  from_address: '',
  use_tls: true,
  resend_api_key: '',
  resend_from: '',
  recipient: '',
}

export function Admin() {
  const { navLayout, setNavLayout } = useNavLayout()
  const { theme } = useTheme()
  const { toast } = useToast()
  const pageBg = theme === 'dark' ? '#0a0f1a' : '#f3f4f6'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentLogo, setCurrentLogo] = useState<string | null>(null)

  // Email configuration
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG)
  const [testEmail, setTestEmail] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)

  // PLC/SCADA connection state
  const [plcIP, setPlcIP] = useState('192.168.1.100')
  const [plcPort, setPlcPort] = useState('102')
  const [plcType, setPlcType] = useState('S7-1500')
  const [rackNumber, setRackNumber] = useState('0')
  const [slotNumber, setSlotNumber] = useState('2')
  const [plcTimeoutMs, setPlcTimeoutMs] = useState('5000')
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'not_connected'>('not_connected')

  useEffect(() => {
    settingsApi
      .getEmailConfig()
      .then((res) => {
        if (res.data?.data) setConfig({ ...DEFAULT_CONFIG, ...res.data.data })
      })
      .catch(() => {})
  }, [])

  const updateConfig = (patch: Partial<EmailConfig>) => setConfig((c) => ({ ...c, ...patch }))

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => setCurrentLogo(e.target?.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await settingsApi.saveEmailConfig(config)
      toast({ title: 'Saved', description: 'Email configuration saved' })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.response?.data?.message || 'Failed to save configuration',
        variant: 'destructive',
      })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSendTest = async () => {
    const to = testEmail.trim() || config.recipient.trim()
    if (!to) {
      toast({ title: 'Missing recipient', description: 'Enter a test recipient email', variant: 'destructive' })
      return
    }
    setTestingEmail(true)
    try {
      const res = await settingsApi.sendTest(to)
      if (res.data?.status === 'success')
        toast({ title: 'Test sent', description: res.data.message || `Test email sent to ${to}` })
      else
        toast({ title: 'Failed', description: res.data?.message || 'Test failed', variant: 'destructive' })
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.response?.data?.message || 'Test failed', variant: 'destructive' })
    } finally {
      setTestingEmail(false)
    }
  }

  const handleTestConnection = () => {
    if (plcIP && plcPort) {
      setConnectionStatus('connected')
      window.setTimeout(() => setConnectionStatus('not_connected'), 3000)
    }
  }

  const inputCls =
    'bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-900 mt-1'

  return (
    <WaterSystemLayout title="Admin Panel" subtitle="System administration and configuration">
      <div
        className="-m-6 min-h-full space-y-6 px-6 py-6 md:px-8 md:py-8 lg:px-10"
        style={{ background: pageBg }}
      >
        {/* Navigation layout */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
          <CardHeader>
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-3">
              <LayoutPanelTop className="h-6 w-6 text-cyan-400 light:text-blue-600" />
              Navigation layout
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="nav-topbar-toggle" className="text-slate-200 light:text-gray-800 text-base">
                  Use top navigation bar
                </Label>
                <p className="text-sm text-slate-400 light:text-gray-600 max-w-xl">
                  When enabled, the sidebar is hidden and primary links appear in a top bar (settings stay on the gear icon).
                  Your choice is saved in this browser.
                </p>
              </div>
              <Switch
                id="nav-topbar-toggle"
                checked={navLayout === 'topbar'}
                onCheckedChange={(checked) => setNavLayout(checked ? 'topbar' : 'sidebar')}
                className="shrink-0 data-[state=checked]:bg-cyan-600"
              />
            </div>
          </CardContent>
        </Card>

        {/* Logo Upload */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
          <CardHeader>
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-3">
              <Upload className="h-6 w-6 text-cyan-400 light:text-blue-600" />
              Admin Panel - Upload Logo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-4">
              <div>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  style={{ backgroundColor: '#0891b2', color: 'white' }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  CHOOSE FILE
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <p className="text-slate-400 light:text-gray-600 text-sm mt-2">No file chosen</p>
              </div>
              <div>
                <h3 className="text-white light:text-gray-900 font-medium mb-2">Current Logo:</h3>
                {currentLogo ? (
                  <img src={currentLogo} alt="Current Logo" className="max-w-xs max-h-32 object-contain border border-slate-600 light:border-gray-300 rounded" />
                ) : (
                  <div className="w-64 h-16 bg-slate-700/50 light:bg-gray-100 rounded border border-slate-600 light:border-gray-300 flex items-center justify-center">
                    <span className="text-slate-400 light:text-gray-500 text-sm">No logo uploaded</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PLC/SCADA Connection Settings */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
          <CardHeader>
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-3">
              <Database className="h-6 w-6 text-cyan-400 light:text-blue-600" />
              PLC/SCADA Connection Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">PLC IP Address</Label>
                <Input value={plcIP} onChange={(e) => setPlcIP(e.target.value)} placeholder="192.168.1.100" className={inputCls} />
              </div>
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">Port</Label>
                <Input value={plcPort} onChange={(e) => setPlcPort(e.target.value)} placeholder="102" className={inputCls} />
              </div>
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">PLC Type</Label>
                <Input value={plcType} onChange={(e) => setPlcType(e.target.value)} placeholder="S7-1500" className={inputCls} />
              </div>
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">Rack Number</Label>
                <Input value={rackNumber} onChange={(e) => setRackNumber(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">Slot Number</Label>
                <Input value={slotNumber} onChange={(e) => setSlotNumber(e.target.value)} placeholder="2" className={inputCls} />
              </div>
              <div>
                <Label className="text-slate-300 light:text-gray-700 text-sm">Timeout (ms)</Label>
                <Input value={plcTimeoutMs} onChange={(e) => setPlcTimeoutMs(e.target.value)} placeholder="5000" className={inputCls} />
              </div>
            </div>
            <div className="bg-slate-700/30 light:bg-gray-50 rounded-lg p-4 mt-4 space-y-2">
              <p className="text-slate-300 light:text-gray-700 text-sm">
                <span className="font-medium">Status:</span>{' '}
                {connectionStatus === 'connected' ? (
                  <span className="text-green-400">Connected</span>
                ) : (
                  <span className="text-red-400">Not Connected</span>
                )}
              </p>
              <p className="text-slate-400 light:text-gray-600 text-sm">Protocol: ISO-on-TCP (RFC1006)</p>
              <p className="text-slate-400 light:text-gray-600 text-sm">Data Block: DB1999 (MASA Mix Line)</p>
            </div>
            <Button onClick={handleTestConnection} className="bg-cyan-600 hover:bg-cyan-700 text-white" style={{ backgroundColor: '#0891b2', color: 'white' }}>
              TEST CONNECTION
            </Button>
          </CardContent>
        </Card>

        {/* Email Configuration */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
          <CardHeader>
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-3">
              <Mail className="h-6 w-6 text-cyan-400 light:text-blue-600" />
              Email Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-slate-400 light:text-gray-600">
              Choose how scheduled reports are sent. Recipients are configured per rule on the Report Distribution page.
            </p>

            {/* Method selector */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { id: 'resend', icon: Cloud, title: 'Hercules Cloud Email', desc: 'Sends from reports@herculesv2.app' },
                { id: 'smtp', icon: Server, title: 'Custom SMTP', desc: 'Use your own mail server (Gmail, Office365, …)' },
              ] as const).map((m) => {
                const selected = config.send_method === m.id
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => updateConfig({ send_method: m.id })}
                    className="relative block w-full text-left"
                  >
                    <div
                      style={selected ? { backgroundColor: '#0f172a' } : undefined}
                      className={`relative rounded-lg border p-4 transition-colors ${
                        selected
                          ? 'app-chrome-dark border-cyan-500'
                          : 'border-slate-600 light:border-gray-300 light:bg-white hover:border-cyan-500/50'
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500">
                          <Check className="h-3 w-3 text-white" />
                        </span>
                      )}
                      <Icon className={`h-6 w-6 ${selected ? 'text-cyan-400' : 'text-slate-400'}`} />
                      <h3 className={`mt-2 font-bold ${selected ? 'text-white' : 'text-white light:text-gray-900'}`}>{m.title}</h3>
                      <p className={`text-xs ${selected ? 'text-slate-300' : 'text-slate-400 light:text-gray-600'}`}>{m.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* SMTP fields */}
            {config.send_method === 'smtp' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">SMTP Server</Label>
                  <Input value={config.smtp_server} onChange={(e) => updateConfig({ smtp_server: e.target.value })} placeholder="smtp.example.com" className={inputCls} />
                </div>
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">Port</Label>
                  <Input type="number" value={config.smtp_port} onChange={(e) => updateConfig({ smtp_port: parseInt(e.target.value, 10) || 587 })} placeholder="587" className={inputCls} />
                </div>
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">Username</Label>
                  <Input value={config.username} onChange={(e) => updateConfig({ username: e.target.value })} placeholder="user@example.com" className={inputCls} />
                </div>
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">Password</Label>
                  <Input type="password" value={config.password} onChange={(e) => updateConfig({ password: e.target.value })} placeholder="••••••••" className={inputCls} />
                </div>
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">From Address</Label>
                  <Input value={config.from_address} onChange={(e) => updateConfig({ from_address: e.target.value })} placeholder="reports@example.com" className={inputCls} />
                </div>
                <div className="flex items-center gap-3 pt-7">
                  <Switch checked={config.use_tls} onCheckedChange={(c) => updateConfig({ use_tls: c })} className="data-[state=checked]:bg-cyan-600" />
                  <Label className="text-slate-300 light:text-gray-700 text-sm">Use TLS / STARTTLS</Label>
                </div>
              </div>
            )}

            {/* Resend (cloud) fields */}
            {config.send_method === 'resend' && (
              <div className="space-y-4">
                {/* Fixed sender address — display only */}
                <div className="rounded-lg border border-slate-600 light:border-gray-300 bg-slate-700/40 light:bg-gray-50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400 light:text-gray-600">
                    <Mail className="h-4 w-4" /> Sender Address
                  </div>
                  <p className="mt-1 font-mono text-sm text-cyan-300 light:text-blue-700">{config.resend_from}</p>
                  <p className="mt-2 text-xs text-slate-400 light:text-gray-600">
                    Reports are sent from the Hercules cloud email service. No sender configuration needed —
                    just add recipients to your distribution rules.
                  </p>
                </div>
                <div>
                  <Label className="text-slate-300 light:text-gray-700 text-sm">Resend API Key</Label>
                  <Input type="password" value={config.resend_api_key} onChange={(e) => updateConfig({ resend_api_key: e.target.value })} placeholder="re_..." className={inputCls} />
                  <p className="mt-1 text-xs text-slate-500 light:text-gray-500">
                    Required to send via the cloud. Paste your Resend API key once.
                  </p>
                </div>
              </div>
            )}

            {/* Test + Save */}
            <div className="space-y-3 border-t border-slate-700 light:border-gray-200 pt-4">
              <Label className="text-slate-300 light:text-gray-700 text-sm">Send Test Email</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" className="bg-slate-700 light:bg-white border-slate-600 light:border-gray-300 text-white light:text-gray-900" />
                <Button onClick={handleSendTest} disabled={testingEmail} className="bg-cyan-600 hover:bg-cyan-700 text-white whitespace-nowrap" style={{ backgroundColor: '#0891b2', color: 'white' }}>
                  {testingEmail ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  SEND TEST
                </Button>
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white" style={{ backgroundColor: '#0891b2', color: 'white' }}>
                {savingConfig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                SAVE CONFIGURATION
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Report Distribution link */}
        <Card className="bg-slate-800/30 light:bg-white border-slate-700 light:border-gray-200 light:shadow-md">
          <CardHeader>
            <CardTitle className="text-white light:text-gray-900 flex items-center gap-3">
              <Send className="h-6 w-6 text-cyan-400 light:text-blue-600" />
              Report Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400 light:text-gray-600 max-w-xl">
                Create scheduled rules that automatically email or save your reports — pick which report tables to send,
                the format(s), the schedule, and the recipients.
              </p>
              <Link href="/fakieh/distribution">
                <Button className="bg-cyan-600 hover:bg-cyan-700 text-white whitespace-nowrap" style={{ backgroundColor: '#0891b2', color: 'white' }}>
                  Manage Distribution Rules
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </WaterSystemLayout>
  )
}
