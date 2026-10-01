// BASE_URL is '/demo-app/', so calls go to the same origin and context path as the page.
const API = `${import.meta.env.BASE_URL}api`

export interface Hello {
  message: string
  version: string
  builtAt: string
  time: string
}

export interface Note {
  id: number
  text: string
  createdAt: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export const getHello = () => request<Hello>('/hello')

export const getNotes = () => request<Note[]>('/notes')

export const addNote = (text: string) =>
  request<Note>('/notes', { method: 'POST', body: JSON.stringify({ text }) })
