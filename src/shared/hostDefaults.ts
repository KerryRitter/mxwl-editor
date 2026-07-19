import type { DeriveConfig, PresetService } from './types'

export const DEFAULT_DERIVE: DeriveConfig = {
  folderPattern: '(?<name>.+)',
  titleTemplate: '${name}',
  browserUrlTemplate: ''
}

export const DEFAULT_HIDE = [
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.turbo',
  '.nx'
]

export const emptyServices = (): PresetService[] => []
