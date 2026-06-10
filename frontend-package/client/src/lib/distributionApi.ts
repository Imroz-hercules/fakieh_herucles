import axios from 'axios'
import { API_BASE_URL } from '../config/api'

const base = `${API_BASE_URL}/distribution`
const settingsBase = `${API_BASE_URL}/settings`

export type DeliveryMethod = 'email' | 'disk' | 'both'
export type ScheduleType = 'daily' | 'weekly' | 'monthly'
export type ReportFormat = 'pdf' | 'xlsx' | 'csv'
export type WindowMode = 'auto' | 'custom'

export interface DistributionRule {
  id?: number
  name: string
  report_sources: string[]
  formats: ReportFormat[]
  delivery_method: DeliveryMethod
  recipients: string[]
  save_path: string
  schedule_type: ScheduleType
  schedule_time: string
  schedule_day_of_week: number | null
  schedule_day_of_month: number | null
  window_mode: WindowMode
  window_start_time: string
  window_end_time: string
  custom_start: string | null
  custom_end: string | null
  enabled: boolean
  last_run_at?: string | null
  last_run_status?: string | null
  last_run_error?: string | null
  created_at?: string
  updated_at?: string
}

export interface CatalogItem {
  key: string
  label: string
  description: string
  source: string
}

export interface EmailConfig {
  send_method: 'smtp' | 'resend'
  smtp_server: string
  smtp_port: number
  username: string
  password: string
  from_address: string
  use_tls: boolean
  resend_api_key: string
  resend_from: string
  recipient: string
}

export const distributionApi = {
  listRules: () => axios.get(`${base}/rules`),
  createRule: (data: DistributionRule) => axios.post(`${base}/rules`, data),
  updateRule: (id: number, data: DistributionRule) => axios.put(`${base}/rules/${id}`, data),
  deleteRule: (id: number) => axios.delete(`${base}/rules/${id}`),
  runRule: (id: number) => axios.post(`${base}/rules/${id}/run`),
  getCatalog: () => axios.get(`${base}/report-catalog`),
  browseFolders: (path?: string) =>
    axios.get(`${base}/browse-folders`, { params: path ? { path } : {} }),
}

export const settingsApi = {
  getEmailConfig: () => axios.get(`${settingsBase}/smtp-config`),
  saveEmailConfig: (data: Partial<EmailConfig>) => axios.post(`${settingsBase}/smtp-config`, data),
  sendTest: (to_email: string) => axios.post(`${settingsBase}/smtp-test`, { to_email }),
}
