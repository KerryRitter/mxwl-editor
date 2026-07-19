import type { SFTPWrapper } from 'ssh2'
import type { DirEntry } from '../../shared/types'
import type { SshConnection } from './SshConnection'
import { joinRemote, shellQuote } from './util'

const S_IFMT = 0o170000
const S_IFDIR = 0o040000

export interface FileStat {
  isDirectory: boolean
  size: number
  mtime: number
}

export type Encoding = 'utf8' | 'base64'

export interface ReadResult {
  content: string
  encoding: Encoding
}

export class SftpFs {
  constructor(private conn: SshConnection) {}

  private async sftp(): Promise<SFTPWrapper> {
    return this.conn.sftp()
  }

  async readDir(path: string): Promise<DirEntry[]> {
    const sftp = await this.sftp()
    return new Promise<DirEntry[]>((resolve, reject) => {
      sftp.readdir(path, (err, list) => {
        if (err) return reject(new Error(`readdir ${path}: ${err.message}`))
        const entries: DirEntry[] = []
        for (const e of list) {
          if (e.filename === '.' || e.filename === '..') continue
          entries.push({
            name: e.filename,
            path: joinRemote(path, e.filename),
            isDirectory: (e.attrs.mode & S_IFMT) === S_IFDIR
          })
        }
        entries.sort((a, b) =>
          a.isDirectory === b.isDirectory
            ? a.name.localeCompare(b.name)
            : a.isDirectory
              ? -1
              : 1
        )
        resolve(entries)
      })
    })
  }

  async readFile(path: string): Promise<ReadResult> {
    const sftp = await this.sftp()
    return new Promise<ReadResult>((resolve, reject) => {
      sftp.readFile(path, (err, buf) => {
        if (err) return reject(new Error(`readFile ${path}: ${err.message}`))
        const looksBinary = buf.includes(0)
        resolve({
          content: looksBinary ? buf.toString('base64') : buf.toString('utf8'),
          encoding: looksBinary ? 'base64' : 'utf8'
        })
      })
    })
  }

  async writeFile(path: string, content: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise<void>((resolve, reject) => {
      sftp.writeFile(path, Buffer.from(content, 'utf8'), (err) => {
        if (err) return reject(new Error(`writeFile ${path}: ${err.message}`))
        resolve()
      })
    })
  }

  async stat(path: string): Promise<FileStat> {
    const sftp = await this.sftp()
    return new Promise<FileStat>((resolve, reject) => {
      sftp.stat(path, (err, stats) => {
        if (err) return reject(new Error(`stat ${path}: ${err.message}`))
        resolve({
          isDirectory: (stats.mode & S_IFMT) === S_IFDIR,
          size: stats.size,
          mtime: stats.mtime
        })
      })
    })
  }

  async mkdir(path: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise<void>((resolve, reject) => {
      sftp.mkdir(path, (err) => {
        if (err) return reject(new Error(`mkdir ${path}: ${err.message}`))
        resolve()
      })
    })
  }

  async rename(src: string, dst: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise<void>((resolve, reject) => {
      sftp.rename(src, dst, (err) => {
        if (err) return reject(new Error(`rename ${src}: ${err.message}`))
        resolve()
      })
    })
  }

  async deleteFile(path: string): Promise<void> {
    const sftp = await this.sftp()
    return new Promise<void>((resolve, reject) => {
      sftp.unlink(path, (err) => {
        if (err) return reject(new Error(`unlink ${path}: ${err.message}`))
        resolve()
      })
    })
  }

  async remove(path: string, isDir: boolean): Promise<void> {
    if (!isDir) return this.deleteFile(path)
    const { stdout, stderr, code } = await this.conn.exec(`rm -rf ${shellQuote(path)}`)
    if (code !== 0) {
      throw new Error(`rm -rf ${path}: ${stderr || stdout}`)
    }
  }
}
