import { useEffect, useState, type FormEvent } from 'react'
import { addNote, getHello, getNotes, type Hello, type Note } from './api'
import './App.css'

function App() {
  const [hello, setHello] = useState<Hello | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [h, n] = await Promise.all([getHello(), getNotes()])
      setHello(h)
      setNotes(n)
      setError(null)
    } catch (e) {
      setError(`Backend unreachable: ${(e as Error).message}`)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    try {
      const note = await addNote(text)
      setNotes((prev) => [...prev, note])
      setText('')
    } catch (e) {
      setError(`Could not add note: ${(e as Error).message}`)
    }
  }

  return (
    <main className="app">
      <h1>Hello from Jenkins</h1>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="card-head">
          <h2>Backend status</h2>
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {hello ? (
          <dl>
            <dt>Message</dt>
            <dd>{hello.message}</dd>
            <dt>Version</dt>
            <dd>{hello.version}</dd>
            <dt>Built at</dt>
            <dd>{hello.builtAt}</dd>
            <dt>Server time</dt>
            <dd>{hello.time}</dd>
          </dl>
        ) : (
          !error && <p>Loading…</p>
        )}
      </section>

      <section className="card">
        <h2>Notes</h2>
        <form onSubmit={(e) => void onSubmit(e)}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note"
            aria-label="Note text"
          />
          <button type="submit" disabled={!text.trim()}>
            Add
          </button>
        </form>
        {notes.length === 0 ? (
          <p className="muted">No notes yet. Notes live in memory and reset on redeploy.</p>
        ) : (
          <ul>
            {notes.map((n) => (
              <li key={n.id}>
                <span>{n.text}</span>
                <time>{new Date(n.createdAt).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
