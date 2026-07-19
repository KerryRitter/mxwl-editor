import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  rmSync,
  existsSync
} from 'fs'
import { join } from 'path'
import type { DirEntry } from '../../shared/types'
import type { FileStat, ReadResult } from './SftpFs'
import { expandHome } from '../hosts/HostManager'

const S_IFMT = 0o170000
const S_IFDIR = 0o040000

export class LocalFs {
  private resolve(path: string): string {
    return expandHome(path)
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const dir = this.resolve(path)
    const names = readdirSync(dir)
    const entries: DirEntry[] = []
    for (const name of names) {
      if (name === '.' || name === '..') continue
      const full = join(dir, name)
      let isDirectory = false
      try {
        isDirectory = statSync(full).isDirectory()
      } catch {
        continue
      }
      entries.push({
        name,
        path: join(path.endsWith('/') ? path.slice(0, -1) : path, name).replace(/\\/g, '/'),
        isDirectory
      })
    }
    entries.sort((a, b) =>
      a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1
    )
    return entries
  }

  async readFile(path: string): Promise<ReadResult> {
    const buf = readFileSync(this.resolve(path))
    const looksBinary = buf.includes(0)
    return {
      content: looksBinary ? buf.toString('base64') : buf.toString('utf8'),
      encoding: looksBinary ? 'base64' : 'utf8'
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    writeFileSync(this.resolve(path), content, 'utf8')
  }

  async stat(path: string): Promise<FileStat> {
    const s = statSync(this.resolve(path))
    return {
      isDirectory: s.isDirectory(),
      size: s.size,
      mtime: Math.floor(s.mtimeMs / 1000)
    }
  }

  async mkdir(path: string): Promise<void> {
    mkdirSync(this.resolve(path), { recursive: true })
  }

  async rename(src: string, dst: string): Promise<void> {
    renameSync(this.resolve(src), this.resolve(dst))
  }

  async deleteFile(path: string): Promise<void> {
    unlinkSync(this.resolve(path))
  }

  async remove(path: string, isDir: boolean): Promise<void> {
    const p = this.resolve(path)
    if (!existsSync(p)) return
    if (isDir) rmSync(p, { recursive: true, force: true })
    else unlinkSync(p)
  }
}

void S_IFMT
void S_IFDIR
