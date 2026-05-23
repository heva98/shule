export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-1 sm:gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`whitespace-nowrap py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
