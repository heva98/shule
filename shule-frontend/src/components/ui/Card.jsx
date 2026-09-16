export default function Card({ padding = 'p-5', className = '', children }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-card ${padding} ${className}`}>
      {children}
    </div>
  )
}
