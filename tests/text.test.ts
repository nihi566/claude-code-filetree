import { expect, test } from 'claude-code/testing'

import { parseTextArgs, renderTextTree, TEXT_MAX_DEPTH } from '../hooks/text'
import { toNodes } from '../hooks/tree'

const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, mtimeMs: 0, size: 1, isLink: false })

test('parseTextArgs: path, --text, --depth N and --depth=N, depth is clamped', () => {
  expect(parseTextArgs('')).toEqual({ path: '', text: false, depth: 2 })
  expect(parseTextArgs('src --text')).toEqual({ path: 'src', text: true, depth: 2 })
  expect(parseTextArgs('--depth 3 my dir')).toEqual({ path: 'my dir', text: true, depth: 3 })
  expect(parseTextArgs('--depth=99').depth).toBe(TEXT_MAX_DEPTH)
  expect(parseTextArgs('--depth zero')).toEqual({ path: 'zero', text: true, depth: 2 })
  expect(parseTextArgs('--depth=3 4')).toEqual({ path: '4', text: true, depth: 3 })
})

test('renderTextTree: box-drawn tree with git marks, ignored folders and changes below the depth', () => {
  const root = '/r'
  const listed = new Map([
    [root, toNodes(root, [entry('src', 'dir'), entry('build', 'dir'), entry('README.md', 'file'), entry('.env', 'file')])],
    [`${root}/src`, toNodes(`${root}/src`, [entry('a.ts', 'file'), entry('deep', 'dir')])],
  ])
  const out = renderTextTree({
    root,
    label: '~/r',
    listed,
    depth: 2,
    maxLines: 100,
    maxPerDir: 40,
    git: {
      git: { [`${root}/src/a.ts`]: 'M' },
      diff: { [`${root}/src/a.ts`]: [3, 1] },
      counts: { [root]: [1, 1, 0], [`${root}/src`]: [1, 1, 0] },
      ignored: [`${root}/build`],
      branch: { head: 'main', upstream: 'origin/main', ahead: 1, behind: 0 },
      files: { [`${root}/src/a.ts`]: 'mod', [`${root}/src/deep/new.ts`]: 'new' },
    },
  })
  expect(out.startsWith('~/r/  main → origin/main ↑1  ?:1 M:1\n```text\n')).toBe(true)
  expect(out).toContain('├── build/  ignored')
  expect(out).toContain('├── src/  ?:1 M:1')
  expect(out).toContain('│   ├── deep/')
  expect(out).toContain('│   └── a.ts  M +3 -1')
  expect(out).toContain('└── README.md')
  expect(out).not.toContain('.env')
  expect(out).toContain('Changes deeper in the tree:')
  expect(out).toContain('? src/deep/new.ts')
  expect(out).not.toContain('M src/a.ts')
})

test('renderTextTree: caps lines and entries per folder, says what it left out, and shows an empty root', () => {
  const root = '/r'
  const many = toNodes(root, Array.from({ length: 30 }, (_, i) => entry(`f${String(i).padStart(2, '0')}.txt`, 'file')))
  const base = { root, label: 'r', git: null, depth: 1 }
  const perDir = renderTextTree({ ...base, listed: new Map([[root, many]]), maxLines: 100, maxPerDir: 10 })
  expect(perDir).toContain('└── … 20 more')
  expect(perDir).not.toContain('f10.txt')
  const lines = renderTextTree({ ...base, listed: new Map([[root, many]]), maxLines: 5, maxPerDir: 40 })
  expect(lines).toContain('… at least 25 more entries not shown')
  expect(renderTextTree({ ...base, listed: new Map(), maxLines: 5, maxPerDir: 40 })).toContain('(empty)')
})
