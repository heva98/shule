// `draft` with `key` switched to `on`, keeping dependencies consistent:
// switching a module on also switches on what it needs, and switching one off
// also switches off what needs it.
export function toggleModule(draft, modules, key, on) {
  const next = new Set(draft)
  if (on) {
    const add = (k) => {
      next.add(k)
      for (const r of modules.find((m) => m.key === k)?.requires ?? []) add(r)
    }
    add(key)
  } else {
    const remove = (k) => {
      next.delete(k)
      for (const m of modules) if (m.requires.includes(k) && next.has(m.key)) remove(m.key)
    }
    remove(key)
  }
  return next
}
