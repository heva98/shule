import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BookOpen, Edit2, Library as LibraryIcon, Plus, RotateCcw, Trash2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  createBook,
  createBorrowRecord,
  deleteBook,
  getBooks,
  getBorrowRecords,
  markBookLost,
  returnBook,
  updateBook,
} from '../../api/library'
import { getStudents } from '../../api/students'
import { useAuth } from '../../context/AuthContext'
import Modal from '../../components/ui/Modal'
import Tabs from '../../components/ui/Tabs'

const MANAGE_ROLES = ['OWNER', 'HEADTEACHER', 'LIBRARIAN']

const selectCls = `border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700
  focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary`

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Student search (free text — any active student, not class-scoped) ────────

function StudentSearchInput({ selected, onSelect, onClear }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const { data } = useQuery({
    queryKey: ['library-student-search', query],
    queryFn: () => getStudents({ search: query, status: 'ACTIVE' }),
    enabled: query.length >= 2,
    staleTime: 30000,
  })
  const students = data?.results ?? data ?? []

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  if (selected) {
    return (
      <div className="flex items-center gap-2 border-2 border-primary rounded-lg px-3 py-2 bg-primary/5">
        <User size={14} className="text-primary shrink-0" />
        <span className="text-sm flex-1 text-gray-800">
          {selected.full_name} <span className="text-xs text-gray-400 font-mono">{selected.student_id}</span>
        </span>
        <button type="button" onClick={onClear} className="p-0.5 text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(e.target.value.length >= 2) }}
        placeholder="Search by name or student ID…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
      {open && students.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s); setQuery(''); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm transition-colors flex items-center justify-between"
            >
              <span className="font-medium text-gray-900">{s.full_name}</span>
              <span className="text-xs text-gray-400 font-mono">{s.student_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Book modal ─────────────────────────────────────────────────────────────────

function BookModal({ book, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!book
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: book
      ? { ...book }
      : { total_copies: 1 },
  })

  const saveMut = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        total_copies: Number(data.total_copies),
        publication_year: data.publication_year ? Number(data.publication_year) : null,
      }
      return isEdit ? updateBook(book.id, payload) : createBook(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success(isEdit ? 'Book updated.' : 'Book added.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed to save.'),
  })

  return (
    <Modal isOpen title={isEdit ? 'Edit Book' : 'Add Book'} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit((d) => saveMut.mutate(d))} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Title *</label>
          <input {...register('title', { required: 'Required' })} placeholder="e.g. Things Fall Apart"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {errors.title && <p className="text-xs text-danger mt-1">{errors.title.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Author</label>
            <input {...register('author')} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ISBN</label>
            <input {...register('isbn')} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <input {...register('category')} placeholder="e.g. Fiction"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Publication Year</label>
            <input type="number" {...register('publication_year')} placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Shelf Location</label>
            <input {...register('shelf_location')} placeholder="e.g. A3"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Total Copies *</label>
            <input type="number" min="1" {...register('total_copies', { required: true, min: 1 })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea {...register('notes')} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
            {saveMut.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Book'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteBookModal({ book, onClose }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => deleteBook(book.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Book removed.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail ?? 'Failed — it may still have active loans.'),
  })
  return (
    <Modal isOpen title="Remove Book" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <p className="text-sm text-gray-600">Remove <strong>{book.title}</strong> from the catalog? This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending}
            className="flex-1 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50">
            {mut.isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Catalog tab ──────────────────────────────────────────────────────────────

function CatalogTab({ canManage }) {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editBook, setEditBook] = useState(null)
  const [deleteBookTarget, setDeleteBookTarget] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['books', search],
    queryFn: () => getBooks({ search: search || undefined }),
  })
  const books = data?.results ?? data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, author, ISBN…"
          className={selectCls + ' w-full sm:w-72'} />
        {canManage && (
          <button onClick={() => setShowAdd(true)}
            className="sm:ml-auto flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Add Book
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse h-32" />)}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          <BookOpen size={28} className="mx-auto text-gray-200 mb-2" />
          No books found.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((b) => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{b.title}</p>
                  {b.author && <p className="text-xs text-gray-500 mt-0.5">{b.author}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditBook(b)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Edit2 size={13} /></button>
                    <button onClick={() => setDeleteBookTarget(b)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {b.category && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{b.category}</span>}
                {b.shelf_location && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Shelf {b.shelf_location}</span>}
              </div>
              <p className="text-xs text-gray-400 mt-3">{b.available_copies} / {b.total_copies} available</p>
            </div>
          ))}
        </div>
      )}

      {showAdd && <BookModal onClose={() => setShowAdd(false)} />}
      {editBook && <BookModal book={editBook} onClose={() => setEditBook(null)} />}
      {deleteBookTarget && <DeleteBookModal book={deleteBookTarget} onClose={() => setDeleteBookTarget(null)} />}
    </div>
  )
}

// ── Issue book modal ─────────────────────────────────────────────────────────

function IssueBookModal({ onClose }) {
  const qc = useQueryClient()
  const [bookId, setBookId] = useState('')
  const [student, setStudent] = useState(null)
  const today = new Date().toISOString().slice(0, 10)
  const [dueDate, setDueDate] = useState(addDays(today, 14))

  const { data: booksData } = useQuery({ queryKey: ['books', 'all'], queryFn: () => getBooks({}) })
  const books = (booksData?.results ?? booksData ?? []).filter((b) => b.available_copies > 0)

  const saveMut = useMutation({
    mutationFn: () => createBorrowRecord({ book: bookId, student: student.id, due_date: dueDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['borrow-records'] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Book issued.')
      onClose()
    },
    onError: (err) => {
      const data = err.response?.data
      toast.error(data?.book?.[0] ?? data?.detail ?? 'Failed to issue book.')
    },
  })

  return (
    <Modal isOpen title="Issue Book" onClose={onClose} size="sm">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Book *</label>
          <select value={bookId} onChange={(e) => setBookId(e.target.value)} className={selectCls + ' w-full'}>
            <option value="">Select…</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>{b.title} ({b.available_copies} available)</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Student *</label>
          <StudentSearchInput selected={student} onSelect={setStudent} onClear={() => setStudent(null)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Due Date *</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={!bookId || !student || !dueDate || saveMut.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saveMut.isPending ? 'Issuing…' : 'Issue Book'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Borrow records tab ───────────────────────────────────────────────────────

function BorrowRecordsTab({ canManage }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('BORROWED')
  const [showIssue, setShowIssue] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['borrow-records', statusFilter],
    queryFn: () => getBorrowRecords(statusFilter ? { status: statusFilter } : {}),
  })
  const records = data?.results ?? data ?? []

  const returnMut = useMutation({
    mutationFn: (id) => returnBook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['borrow-records'] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Book returned.')
    },
    onError: () => toast.error('Failed to mark returned.'),
  })

  const lostMut = useMutation({
    mutationFn: (id) => markBookLost(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['borrow-records'] })
      qc.invalidateQueries({ queryKey: ['books'] })
      toast.success('Book marked lost.')
    },
    onError: () => toast.error('Failed to update.'),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="">All statuses</option>
          <option value="BORROWED">Currently borrowed</option>
          <option value="RETURNED">Returned</option>
          <option value="LOST">Lost</option>
        </select>
        {canManage && (
          <button onClick={() => setShowIssue(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={14} /> Issue Book
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Student</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Book</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Borrowed</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Due</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
              {canManage && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i}><td colSpan={6} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td></tr>
              ))
            ) : records.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">
                <LibraryIcon size={28} className="mx-auto text-gray-200 mb-2" />
                No borrow records found.
              </td></tr>
            ) : records.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{r.student_name}</td>
                <td className="px-4 py-3 text-gray-600">{r.book_title}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(r.borrowed_date)}</td>
                <td className="px-4 py-3 text-gray-500">
                  <div className="flex items-center gap-1.5">
                    {fmtDate(r.due_date)}
                    {r.is_overdue && <AlertTriangle size={12} className="text-danger" />}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {r.status === 'BORROWED' && r.is_overdue ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Overdue</span>
                  ) : r.status === 'BORROWED' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Borrowed</span>
                  ) : r.status === 'RETURNED' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Returned</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">Lost</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    {r.status === 'BORROWED' && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => returnMut.mutate(r.id)} title="Mark returned"
                          className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-success">
                          <RotateCcw size={13} />
                        </button>
                        <button onClick={() => lostMut.mutate(r.id)} title="Mark lost"
                          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-danger">
                          <AlertTriangle size={13} />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showIssue && <IssueBookModal onClose={() => setShowIssue(false)} />}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const { user } = useAuth()
  const canManage = MANAGE_ROLES.includes(user?.role)
  const [tab, setTab] = useState('catalog')

  const tabs = [
    { id: 'catalog', label: 'Catalog' },
    { id: 'records', label: 'Borrow Records' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Library</h1>
        <p className="text-sm text-gray-500 mt-0.5">Book catalog, borrowing, and overdue tracking.</p>
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'catalog' && <CatalogTab canManage={canManage} />}
      {tab === 'records' && <BorrowRecordsTab canManage={canManage} />}
    </div>
  )
}
