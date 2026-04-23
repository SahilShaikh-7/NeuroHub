// IndexedDB-backed sync queue for offline task/habit actions
// Usage: import { enqueue, flushQueue, getQueueSize, registerOnlineFlush }
const DB_NAME = 'neuroflow_offline'
const STORE = 'queue'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueue(action) {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).add({ ...action, queuedAt: Date.now() })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    return false
  }
}

export async function getAll() {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function clearQueue() {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve(true)
    })
  } catch {
    return false
  }
}

export async function getQueueSize() {
  const items = await getAll()
  return items.length
}

export async function flushQueue(apiFetch) {
  const items = await getAll()
  if (!items.length) return { flushed: 0 }
  let flushed = 0
  for (const it of items) {
    try {
      await apiFetch(it.path, { method: it.method, body: it.body ? JSON.stringify(it.body) : undefined })
      flushed++
    } catch {
      // stop on first failure to preserve order
      break
    }
  }
  if (flushed === items.length) await clearQueue()
  else {
    // remove first N
    try {
      const db = await openDb()
      for (let i = 0; i < flushed; i++) {
        await new Promise((resolve) => {
          const tx = db.transaction(STORE, 'readwrite')
          tx.objectStore(STORE).delete(items[i].id)
          tx.oncomplete = () => resolve()
        })
      }
    } catch {}
  }
  return { flushed, remaining: items.length - flushed }
}
