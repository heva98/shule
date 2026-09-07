import { useState } from 'react'
import { Mail, Smartphone } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useEnabledModules } from '../../hooks/useEnabledModules'
import { FEATURE_ROLES } from '../../lib/constants'
import EmailChannel from './EmailChannel'
import SmsChannel from './SmsChannel'

// One page, two channels. Email broadcasts (the old Communications page) and
// bulk parent SMS (the old Parent SMS page) now live under a single
// Communications entry — a school with only one of the two modules on simply
// sees that channel with no switcher.

const CHANNEL_TABS = [
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'sms',   label: 'SMS',   Icon: Smartphone },
]

export default function CommunicationsPage() {
  const { user } = useAuth()
  const { enabledModules } = useEnabledModules()
  const role = user?.role ?? ''

  const emailAvailable =
    enabledModules.includes('communications') && FEATURE_ROLES.COMMUNICATIONS.includes(role)
  const smsAvailable =
    enabledModules.includes('sms') && FEATURE_ROLES.SMS.includes(role)

  const [channel, setChannel] = useState(emailAvailable ? 'email' : 'sms')

  if (!emailAvailable && !smsAvailable) {
    return (
      <p className="text-sm text-gray-500">
        No communication channels are enabled for your role.
      </p>
    )
  }

  const bothAvailable = emailAvailable && smsAvailable
  // Keep the rendered channel in sync with what the role can actually use, in
  // case `channel` still points at a tab that isn't available.
  const active =
    channel === 'sms' && smsAvailable ? 'sms'
    : channel === 'email' && emailAvailable ? 'email'
    : emailAvailable ? 'email' : 'sms'

  return (
    <div className="space-y-5">
      {bothAvailable && (
        <div className="flex gap-6 border-b border-gray-200">
          {CHANNEL_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setChannel(key)}
              className={`flex items-center gap-2 pb-3 -mb-px text-sm font-semibold border-b-2 transition-colors
                ${active === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      )}

      {active === 'email'
        ? <EmailChannel onSwitchToSms={smsAvailable ? () => setChannel('sms') : undefined} />
        : <SmsChannel />}
    </div>
  )
}
