import type { Branch, FileNode } from '../types'
import { type Change, relative } from './tree'

export type TextGit = {
  git: Record<string, string>
  diff: Record<string, [number, number]>
  counts: Record<string, [number, number, number]>
  ignored: string[]
  branch: Branch | null
  files: Record<string, Change>
}

export type TextTreeInput = {
  root: string
  label: string
  listed: Map<string, FileNode[]>
  git: TextGit | null
  depth: number
  maxLines: number
  maxPerDir: number
}

export const TEXT_DEPTH = 2
export const TEXT_MAX_DEPTH = 6
export const TEXT_MAX_LINES = 150
export const TEXT_MAX_PER_DIR = 40
export const TEXT_MAX_DIRS = 300
const TEXT_MAX_DEEP_CHANGES = 30

function countText(c: [number, number, number] | undefined): string {
  if (!c) return ''
  return [c[0] ? `?:${c[0]}` : '', c[1] ? `M:${c[1]}` : '', c[2] ? `D:${c[2]}` : ''].filter(Boolean).join(' ')
}

function branchText(b: Branch | null): string {
  if (!b?.head) return ''
  const sync = [b.ahead ? `↑${b.ahead}` : '', b.behind ? `↓${b.behind}` : ''].filter(Boolean).join(' ')
  return [b.head, b.upstream ? `→ ${b.upstream}` : '', sync].filter(Boolean).join(' ')
}

function locText(loc: [number, number] | undefined): string {
  return loc ? [loc[0] ? `+${loc[0]}` : '', loc[1] ? `-${loc[1]}` : ''].filter(Boolean).join(' ') : ''
}

function suffix(n: FileNode, g: TextGit | null): string {
  if (!g) return ''
  if (n.kind === 'dir') return countText(g.counts[n.id])
  return [g.git[n.id] ?? '', locText(g.diff[n.id])].filter(Boolean).join(' ')
}

export function renderTextTree(input: TextTreeInput): string {
  const { root, listed, git: g } = input
  const ignored = new Set(g?.ignored ?? [])
  const lines: string[] = []
  const shown = new Set<string>()
  let cut = 0
  const walk = (dir: string, prefix: string, level: number) => {
    const all = (listed.get(dir) ?? []).filter(n => !n.hidden)
    const kids = all.slice(0, input.maxPerDir)
    kids.forEach((n, i) => {
      if (lines.length >= input.maxLines) {
        cut += 1
        return
      }
      const last = i === kids.length - 1 && all.length <= input.maxPerDir
      const name = n.kind === 'dir' ? `${n.name}/` : n.name
      const tail = ignored.has(n.id) ? 'ignored' : suffix(n, g)
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}${tail ? `  ${tail}` : ''}`)
      shown.add(n.id)
      if (n.kind === 'dir' && level + 1 < input.depth && listed.has(n.id)) walk(n.id, prefix + (last ? '    ' : '│   '), level + 1)
    })
    if (all.length > input.maxPerDir) {
      if (lines.length < input.maxLines) lines.push(`${prefix}└── … ${all.length - input.maxPerDir} more`)
      else cut += all.length - input.maxPerDir
    }
  }
  walk(root, '', 0)
  if (lines.length === 0) lines.push('(empty)')
  if (cut > 0) lines.push(`… at least ${cut} more entries not shown (narrow it with /filetree <path>)`)

  // The head goes before the fence: the host prints the command's name in front of the first line.
  const head = [input.label.endsWith('/') ? input.label : `${input.label}/`,branchText(g?.branch ?? null), countText(g?.counts[root])].filter(Boolean).join('  ')
  const out = [head, '```text', ...lines, '```']

  const deep = g ? Object.entries(g.files).filter(([path]) => !shown.has(path) && !ignored.has(path)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : []
  if (deep.length) {
    const word: Record<Change, string> = { new: '?', mod: 'M', del: 'D' }
    out.push('', 'Changes deeper in the tree:', '```text')
    for (const [path, change] of deep.slice(0, TEXT_MAX_DEEP_CHANGES)) {
      const loc = locText(g?.diff[path])
      out.push(`${word[change]} ${relative(root, path)}${loc ? `  ${loc}` : ''}`)
    }
    if (deep.length > TEXT_MAX_DEEP_CHANGES) out.push(`… ${deep.length - TEXT_MAX_DEEP_CHANGES} more`)
    out.push('```')
  }
  return out.join('\n')
}

export function parseTextArgs(args: string): { path: string; text: boolean; depth: number } {
  const words = args.trim().split(/\s+/).filter(Boolean)
  let text = false
  let depth = TEXT_DEPTH
  const rest: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    if (w === '--text') text = true
    else if (w === '--depth' || w.startsWith('--depth=')) {
      let raw = w.includes('=') ? w.slice(w.indexOf('=') + 1) : ''
      if (!w.includes('=') && /^\d+$/.test(words[i + 1] ?? '')) raw = words[++i] ?? ''
      const n = Number.parseInt(raw, 10)
      if (Number.isFinite(n) && n > 0) depth = Math.min(n, TEXT_MAX_DEPTH)
      text = true
    } else rest.push(w)
  }
  return { path: rest.join(' '), text, depth }
}
